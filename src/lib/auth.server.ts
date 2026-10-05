import { getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = "owner" | "hr" | "manager";
export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  scope_node_ids: string[];
  status: string;
  must_change_password: boolean;
};

export const SESSION_HEADER = "x-app-session";
const ITER = 100_000;
const SESSION_DAYS = 14;

/**
 * Privileged database client. On-prem deployment: when DATABASE_URL is set,
 * connects directly to the local PostgreSQL via the pg adapter (same query
 * subset); otherwise uses the managed cloud database client.
 * Both satisfy the same call surface the app already uses.
 */
export async function admin(): Promise<SupabaseClient<Database>> {
  if (process.env["DATABASE_URL"]) {
    const { pgAdmin } = await import("./pg.server");
    return pgAdmin() as unknown as SupabaseClient<Database>;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, iterS, saltS, hashS] = stored.split("$");
  if (alg !== "pbkdf2" || !iterS || !saltS || !hashS) return false;
  const bits = new Uint8Array(await derive(password, unb64(saltS), Number(iterS)));
  const expected = unb64(hashS);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i]! ^ expected[i]!;
  return diff === 0;
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
  const db = await admin();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const { error } = await db
    .from("app_sessions")
    .insert({ user_id: userId, token_hash: await sha256(token), expires_at: expires });
  if (error) throw new Error(error.message);
  await db.from("app_users").update({ last_login_at: new Date().toISOString() }).eq("id", userId);
  return token;
}

export async function destroySession() {
  const token = getRequestHeader(SESSION_HEADER);
  if (!token) return;
  const db = await admin();
  await db.from("app_sessions").delete().eq("token_hash", await sha256(token));
}

export async function getSessionUser(): Promise<AppUser | null> {
  const token = getRequestHeader(SESSION_HEADER);
  if (!token || token.length !== 64) return null;
  const db = await admin();
  const { data: s } = await db
    .from("app_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const { data: u } = await db
    .from("app_users")
    .select("id,email,name,role,scope_node_ids,status,must_change_password")
    .eq("id", s.user_id)
    .maybeSingle();
  if (!u || u.status !== "active") return null;
  return u as AppUser;
}

export async function requireUser(roles?: AppRole[]) {
  const u = await getSessionUser();
  if (!u) throw new Error("Unauthorized: please sign in");
  if (roles && !roles.includes(u.role)) throw new Error("Forbidden: insufficient permission");
  return u;
}

/** For managers: the set of org node ids (incl. descendants) and people ids they may touch. */
export async function managerScope(user: AppUser) {
  const db = await admin();
  const { data: nodes } = await db.from("org_nodes").select("id,parent_id");
  const children = new Map<string, string[]>();
  for (const n of nodes ?? []) {
    if (!n.parent_id) continue;
    const arr = children.get(n.parent_id) ?? [];
    arr.push(n.id);
    children.set(n.parent_id, arr);
  }
  const nodeIds = new Set<string>();
  const stack = [...user.scope_node_ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (nodeIds.has(id)) continue;
    nodeIds.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  const { data: people } = nodeIds.size
    ? await db.from("people").select("id").in("org_node_id", [...nodeIds])
    : { data: [] as { id: string }[] };
  return { nodeIds, personIds: new Set((people ?? []).map((p) => p.id)) };
}

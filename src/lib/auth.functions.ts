import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  admin,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  requireUser,
  verifyPassword,
} from "./auth.server";

const email = z.string().trim().toLowerCase().email().max(255);
const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const role = z.enum(["owner", "hr", "manager", "recruiter"]);
const USER_COLS = "id,email,name,role,scope_node_ids,status,must_change_password,last_login_at,created_at";

async function audit(actor: string, action: string, detail: string) {
  const db = await admin();
  await db.from("audit_log").insert({ actor, action, entity: "user", detail });
}

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  return await getSessionUser();
});

export const needsSetup = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { count } = await db.from("app_users").select("id", { count: "exact", head: true });
  return (count ?? 0) === 0;
});

export const setupOwner = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(100), email, password }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db.from("app_users").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("Setup already completed");
    const { data: u, error } = await db
      .from("app_users")
      .insert({
        name: data.name,
        email: data.email,
        role: "owner",
        password_hash: await hashPassword(data.password),
        must_change_password: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(data.name, "Create", `Owner account created: ${data.email}`);
    return { token: await createSession(u.id) };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email, password: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: u } = await db
      .from("app_users")
      .select("id,password_hash,status")
      .eq("email", data.email)
      .maybeSingle();
    const ok = u ? await verifyPassword(data.password, u.password_hash) : false;
    if (!u || !ok) throw new Error("Invalid email or password");
    if (u.status !== "active") throw new Error("This account has been disabled");
    return { token: await createSession(u.id) };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ current: z.string().min(1).max(128), next: password }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const db = await admin();
    const { data: u } = await db.from("app_users").select("password_hash").eq("id", me.id).single();
    if (!u || !(await verifyPassword(data.current, u.password_hash)))
      throw new Error("Current password is incorrect");
    const { error } = await db
      .from("app_users")
      .update({ password_hash: await hashPassword(data.next), must_change_password: false })
      .eq("id", me.id);
    if (error) throw new Error(error.message);
    await audit(me.name, "Edit", `Changed own password`);
    return { ok: true };
  });

// ---------- owner-only user management ----------

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser(["owner"]);
  const db = await admin();
  const { data, error } = await db.from("app_users").select(USER_COLS).order("created_at");
  if (error) throw new Error(error.message);
  return data;
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(1).max(100),
        email,
        role,
        scope_node_ids: z.array(z.string().max(100)).max(100),
        password,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const me = await requireUser(["owner"]);
    const db = await admin();
    const { error } = await db.from("app_users").insert({
      name: data.name,
      email: data.email,
      role: data.role,
      scope_node_ids: data.role === "manager" || data.role === "hr" ? data.scope_node_ids : [],
      password_hash: await hashPassword(data.password),
      must_change_password: true,
    });
    if (error) throw new Error(error.code === "23505" ? "This email already exists" : error.message);
    await audit(me.name, "Create", `User ${data.email} (${data.role})`);
    return { ok: true };
  });

export const updateUser = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        role,
        scope_node_ids: z.array(z.string().max(100)).max(100),
        status: z.enum(["active", "disabled"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const me = await requireUser(["owner"]);
    if (data.id === me.id && (data.role !== "owner" || data.status !== "active"))
      throw new Error("You cannot demote or disable your own owner account");
    const db = await admin();
    const { data: prev } = await db.from("app_users").select("email").eq("id", data.id).single();
    const { error } = await db
      .from("app_users")
      .update({
        name: data.name,
        role: data.role,
        scope_node_ids: data.role === "manager" || data.role === "hr" ? data.scope_node_ids : [],
        status: data.status,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.status === "disabled") await db.from("app_sessions").delete().eq("user_id", data.id);
    await audit(me.name, "Permission Change", `User ${prev?.email}: ${data.role}, ${data.status}`);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), password }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireUser(["owner"]);
    const db = await admin();
    const { data: prev } = await db.from("app_users").select("email").eq("id", data.id).single();
    const { error } = await db
      .from("app_users")
      .update({ password_hash: await hashPassword(data.password), must_change_password: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await db.from("app_sessions").delete().eq("user_id", data.id);
    await audit(me.name, "Edit", `Reset password for ${prev?.email}`);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const me = await requireUser(["owner"]);
    if (data.id === me.id) throw new Error("You cannot delete your own account");
    const db = await admin();
    const { data: prev } = await db.from("app_users").select("email").eq("id", data.id).single();
    const { error } = await db.from("app_users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(me.name, "Delete", `User ${prev?.email}`);
    return { ok: true };
  });

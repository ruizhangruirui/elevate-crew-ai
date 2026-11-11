// Read-only integration API for the independent Presence Board.
// The Talent Management Tool stays the single source of truth; these helpers
// expose a narrow, allowlisted projection of people / org_nodes / supervisors.
// Auth: dedicated PRESENCE_API_KEY env var (server-only), fail closed.

import { leadersOf, supervisorOf } from "./supervisor";
import type { Person } from "./talent";

export const PRESENCE_KEY_HEADER = "x-presence-key";

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Constant-time-ish comparison of the provided key against the configured
 * integration secret. Fails closed: missing configuration or missing/invalid
 * key both return false. Never logs either value.
 */
export function verifyIntegrationKey(provided: string | null, configured: string | undefined): boolean {
  if (!configured || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(configured);
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (a[i % a.length] ?? 0) ^ (b[i % b.length] ?? 0);
  return diff === 0;
}

/** Extract the integration key from a request (header or Bearer token). */
export function extractIntegrationKey(request: Request): string | null {
  const header = request.headers.get(PRESENCE_KEY_HEADER);
  if (header) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting (ad-hoc, in-memory)
// ---------------------------------------------------------------------------
// The platform has no standard rate-limiting primitive. This per-process
// fixed-window limiter is a deliberate tradeoff: it resets on restart and is
// per-instance (each Cloudflare isolate / VM process counts separately).

export type RateLimiter = {
  /** Returns true when the request is allowed, false when the limit is hit. */
  allow: (id: string) => boolean;
};

export function createRateLimiter(maxRequests: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return {
    allow(id) {
      const t = now();
      const cur = hits.get(id);
      if (!cur || t - cur.windowStart >= windowMs) {
        hits.set(id, { windowStart: t, count: 1 });
        return true;
      }
      cur.count += 1;
      return cur.count <= maxRequests;
    },
  };
}

/** Shared limiter for the presence endpoints: 120 requests per minute. */
export const presenceRateLimiter = createRateLimiter(120, 60_000);

// ---------------------------------------------------------------------------
// Field allowlists — anything not listed here never leaves the server.
// ---------------------------------------------------------------------------

export const EMPLOYEE_FIELDS = [
  "id",
  "name",
  "org_node_id",
  "supervisor_id",
  "is_leader",
  "archived",
  "status",
  "company_email",
  "updated_at",
] as const;

export const ORG_NODE_FIELDS = ["id", "parent_id", "name", "type", "archived", "updated_at"] as const;

type PersonRow = Pick<
  Person,
  "id" | "name" | "org_node_id" | "supervisor_id" | "is_leader" | "archived" | "status" | "company_email"
> & { updated_at?: string | null };

type NodeRow = {
  id: string;
  parent_id: string | null;
  name: string;
  type: string;
  archived?: boolean | null;
  updated_at?: string | null;
};

// ---------------------------------------------------------------------------
// Response builders (pure functions over rows — unit tested with fixtures)
// ---------------------------------------------------------------------------

export type PresenceEmployee = {
  id: string;
  name: string;
  org_node_id: string | null;
  supervisor_id: string | null;
  is_leader: boolean;
  archived: boolean;
  status: string;
  company_email: string | null;
  updated_at: string | null;
};

/** Resolve the effective supervisor and project to the allowlisted shape. Output is sorted by id (deterministic snapshots). */
export function buildEmployees(people: PersonRow[], nodes: NodeRow[]): PresenceEmployee[] {
  const asPeople = people as unknown as Person[];
  const asNodes = nodes as { id: string; parent_id: string | null; type: string; name: string }[];
  return people
    .map((p) => {
    const resolved = supervisorOf(p as unknown as Person, asPeople, asNodes);
    return {
      id: p.id,
      name: p.name,
      org_node_id: p.org_node_id ?? null,
      supervisor_id: resolved?.id ?? null,
      is_leader: p.is_leader === true,
      archived: p.archived === true,
      status: p.status,
      company_email: p.company_email ?? null,
      updated_at: p.updated_at ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export type PresenceOrgNode = {
  id: string;
  parent_id: string | null;
  name: string;
  node_type: string;
  is_active: boolean;
  updated_at: string | null;
};

export function buildOrganization(nodes: NodeRow[]): PresenceOrgNode[] {
  return nodes
    .map((n) => ({
      id: n.id,
      parent_id: n.parent_id ?? null,
      name: n.name,
      node_type: n.type,
      is_active: n.archived !== true,
      updated_at: n.updated_at ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export type PresenceManager = {
  manager_id: string;
  node_ids: string[];
  direct_reports: { person_id: string; relationship: "explicit" | "inferred" }[];
};

/**
 * Manager view: everyone who leads at least one node, or is someone's
 * resolved supervisor. Direct reports carry whether the link is an explicit
 * people.supervisor_id override or inferred from org leadership.
 */
export function buildManagers(people: PersonRow[], nodes: NodeRow[]): PresenceManager[] {
  const asPeople = people as unknown as Person[];
  const asNodes = nodes as { id: string; parent_id: string | null; type: string; name: string }[];
  const active = people.filter((p) => p.archived !== true && p.status !== "left");
  const byManager = new Map<string, PresenceManager>();

  const ensure = (id: string): PresenceManager => {
    let m = byManager.get(id);
    if (!m) {
      m = { manager_id: id, node_ids: [], direct_reports: [] };
      byManager.set(id, m);
    }
    return m;
  };

  for (const n of nodes) {
    if (n.archived === true) continue;
    for (const lead of leadersOf(n.id, asPeople)) {
      const m = ensure(lead.id);
      if (!m.node_ids.includes(n.id)) m.node_ids.push(n.id);
    }
  }

  for (const p of active) {
    const sup = supervisorOf(p as unknown as Person, asPeople, asNodes);
    if (!sup || sup.id === p.id) continue;
    const m = ensure(sup.id);
    m.direct_reports.push({
      person_id: p.id,
      relationship: p.supervisor_id === sup.id ? "explicit" : "inferred",
    });
  }

  return [...byManager.values()].sort((a, b) => a.manager_id.localeCompare(b.manager_id));
}

// ---------------------------------------------------------------------------
// Pagination and incremental synchronization
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 500;
export const MAX_PAGE_SIZE = 1000;

export function parsePagination(url: URL): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get("limit"));
  const rawOffset = Number(url.searchParams.get("offset"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

export function paginate<T>(items: T[], limit: number, offset: number): { page: T[]; total: number; next_offset: number | null } {
  const page = items.slice(offset, offset + limit);
  const next = offset + limit;
  return { page, total: items.length, next_offset: next < items.length ? next : null };
}

/** Keep rows changed after the cursor; rows without a timestamp are always included (safe). */
export function filterSince<T extends { updated_at: string | null }>(items: T[], since: string | null): T[] {
  if (!since) return items;
  const t = Date.parse(since);
  if (Number.isNaN(t)) return items;
  return items.filter((i) => !i.updated_at || Date.parse(i.updated_at) > t);
}

/**
 * Keep rows last changed at or before the snapshot timestamp. Rows written
 * while a snapshot is being fetched are excluded from it and picked up by the
 * next sync, so concurrent writes cannot shift pages mid-snapshot.
 */
export function filterAsOf<T extends { updated_at: string | null }>(items: T[], asOf: string): T[] {
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return items;
  return items.filter((i) => !i.updated_at || Date.parse(i.updated_at) <= t);
}

/** Next cursor = newest timestamp in the result, so a follow-up call misses nothing returned here. */
export function nextCursor(items: { updated_at: string | null }[], fallback: string): string {
  let max = Date.parse(fallback);
  for (const i of items) {
    if (i.updated_at) {
      const t = Date.parse(i.updated_at);
      if (!Number.isNaN(t) && t > max) max = t;
    }
  }
  return new Date(max).toISOString();
}

// ---------------------------------------------------------------------------
// Data loading (privileged, both deployment modes via admin())
// ---------------------------------------------------------------------------

type DbClient = { from: (table: string) => any };

export async function loadPresenceRows(db: DbClient): Promise<{ people: PersonRow[]; nodes: NodeRow[] }> {
  // Stable explicit ordering: pagination correctness depends on a deterministic
  // row order. Both adapters (cloud client and pg Builder) support .order().
  const [peopleRes, nodesRes] = await Promise.all([
    db.from("people").select(EMPLOYEE_FIELDS.join(",")).order("id", { ascending: true }),
    db.from("org_nodes").select(ORG_NODE_FIELDS.join(",")).order("id", { ascending: true }),
  ]);
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  return { people: (peopleRes.data ?? []) as PersonRow[], nodes: (nodesRes.data ?? []) as NodeRow[] };
}

// ---------------------------------------------------------------------------
// Request handling shared by the four route handlers
// ---------------------------------------------------------------------------

export type PresenceAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/** Fail closed: 503 when the integration is not configured, 401 on bad key. */
export function authenticatePresenceRequest(request: Request): PresenceAuthResult {
  const configured = process.env["PRESENCE_API_KEY"];
  if (!configured) return { ok: false, status: 503, error: "Integration not configured" };
  if (!verifyIntegrationKey(extractIntegrationKey(request), configured)) {
    return { ok: false, status: 401, error: "Invalid integration credentials" };
  }
  return { ok: true };
}

/** Structured access log — endpoint, status, key fingerprint never logged. */
export function logPresenceAccess(endpoint: string, status: number, request: Request) {
  const entry = {
    ts: new Date().toISOString(),
    integration: "presence",
    endpoint,
    status,
    ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown",
  };
  console.log(JSON.stringify(entry));
}

/**
 * Injectable dependencies for the presence handler. Route handlers use the
 * defaults (real admin() loader, shared limiter); integration tests inject
 * synthetic loaders and fresh limiters to exercise the full HTTP path.
 */
export type PresenceDeps = {
  loadRows?: () => Promise<{ people: PersonRow[]; nodes: NodeRow[] }>;
  limiter?: RateLimiter;
};

async function defaultLoadRows(): Promise<{ people: PersonRow[]; nodes: NodeRow[] }> {
  const { admin } = await import("./auth.server");
  const db = await admin();
  return loadPresenceRows(db);
}

/**
 * Shared handler for the four read-only presence endpoints:
 * authenticate (fail closed) → rate limit → load rows → build the allowlisted
 * projection → snapshot/incremental filter → paginate → log → respond.
 *
 * Full-snapshot consistency contract (no schema changes required):
 * - Rows are ordered by id, so pages are deterministic.
 * - Every response carries `snapshot.id` (an as-of timestamp). Page 1 is
 *   fetched without `as_of`; the server stamps the snapshot and only includes
 *   rows with updated_at <= that timestamp. The client MUST pass
 *   `&as_of=<snapshot.id>` on every subsequent page.
 * - Records written while a snapshot is being fetched are excluded from it
 *   and appear in the next sync — concurrent writes cannot skip or duplicate
 *   rows within one snapshot.
 * - The client MUST verify all pages share the same snapshot.id and MUST
 *   discard the entire snapshot if any page fails or the id changes; a
 *   partial snapshot must never be applied.
 */
export async function respondPresence(
  request: Request,
  endpoint: string,
  build: (rows: { people: PersonRow[]; nodes: NodeRow[] }) => { updated_at: string | null }[],
  opts?: { incremental?: boolean },
  deps?: PresenceDeps,
): Promise<Response> {
  const auth = authenticatePresenceRequest(request);
  if (!auth.ok) {
    logPresenceAccess(endpoint, auth.status, request);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const limiter = deps?.limiter ?? presenceRateLimiter;
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  if (!limiter.allow(ip)) {
    logPresenceAccess(endpoint, 429, request);
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const rows = await (deps?.loadRows ?? defaultLoadRows)();
    let items = build(rows);

    const url = new URL(request.url);
    let cursor: string | null = null;
    let snapshotId: string | null = null;
    if (opts?.incremental) {
      const since = url.searchParams.get("since");
      const now = new Date().toISOString();
      cursor = nextCursor(items, since && !Number.isNaN(Date.parse(since)) ? since : now);
      items = filterSince(items, since);
    } else {
      // As-of snapshot: client echoes the snapshot id from page 1 on later
      // pages; absent or malformed values start a fresh snapshot stamped now.
      const asOfParam = url.searchParams.get("as_of");
      snapshotId = asOfParam && !Number.isNaN(Date.parse(asOfParam)) ? new Date(Date.parse(asOfParam)).toISOString() : new Date().toISOString();
      items = filterAsOf(items, snapshotId);
    }

    const { limit, offset } = parsePagination(url);
    const { page, total, next_offset } = paginate(items, limit, offset);

    logPresenceAccess(endpoint, 200, request);
    return Response.json({
      data: page,
      page: { limit, offset, total, next_offset },
      ...(cursor ? { cursor } : {}),
      ...(snapshotId ? { snapshot: { id: snapshotId, as_of: snapshotId } } : {}),
      // Hard deletes are not tracked; consumers should periodically re-sync
      // a full snapshot (call without `since`) to detect removals.
      sync_mode: opts?.incremental ? "incremental-with-full-snapshot-fallback" : "full-snapshot",
    });
  } catch (e) {
    console.error(`[presence] ${endpoint} failed:`, e instanceof Error ? e.message : e);
    logPresenceAccess(endpoint, 500, request);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

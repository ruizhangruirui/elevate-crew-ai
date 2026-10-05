import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, getSessionUser, managerScope, type AppUser } from "./auth.server";

const TABLES = [
  "actions",
  "audit_log",
  "capability_snapshots",
  "config_items",
  "directions",
  "org_activities",
  "org_activity_participants",
  "org_nodes",
  "orgs",
  "people",
  "performance_records",
  "person_lifecycle_events",
  "person_milestones",
  "person_role_fit",
  "roles",
  "access_users",
  "candidates",
  "candidate_events",
] as const;

const FILTERS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike", "contains", "not", "or", "match", "filter"] as const;

/** Tables linked to a single person via person_id (manager scope applies). */
const PERSON_TABLES = new Set([
  "performance_records",
  "person_milestones",
  "person_lifecycle_events",
  "person_role_fit",
  "org_activity_participants",
  "audit_log",
]);
/** Structure tables managers may read but never change. */
const MANAGER_READONLY = new Set(["org_nodes", "roles", "directions", "orgs", "config_items", "access_users", "capability_snapshots", "candidates", "candidate_events"]);

const specSchema = z.object({
  table: z.enum(TABLES),
  op: z.enum(["select", "insert", "update", "delete", "upsert"]),
  columns: z.string().max(2000).optional(),
  selectOpts: z.object({ count: z.enum(["exact", "planned", "estimated"]).optional(), head: z.boolean().optional() }).optional(),
  payload: z.any().optional(),
  upsertOpts: z.object({ onConflict: z.string().max(200).optional(), ignoreDuplicates: z.boolean().optional() }).optional(),
  returning: z.string().max(2000).nullable().optional(),
  filters: z.array(z.object({ m: z.enum(FILTERS), args: z.array(z.any()).max(3) })).max(30),
  order: z.array(z.object({ col: z.string().max(100), opts: z.any().optional() })).max(10),
  limit: z.number().int().positive().max(10000).optional(),
  single: z.enum(["single", "maybe"]).optional(),
});
export type DbSpec = z.infer<typeof specSchema>;
export type DbResult = { data: any; error: { message: string; code?: string | undefined } | null; count: number | null };

function applyFilters(q: any, filters: DbSpec["filters"]) {
  for (const f of filters) q = q[f.m](...f.args);
  return q;
}

const fail = (message: string, code?: string): DbResult => ({ data: null, error: { message, code }, count: null });

export const dbQuery = createServerFn({ method: "POST" })
  .inputValidator((d) => specSchema.parse(d))
  .handler(async ({ data: spec }): Promise<DbResult> => {
    const user = await getSessionUser();
    if (!user) return fail("Unauthorized: please sign in", "401");
    const db = await admin();

    // Stamp the real actor on audit entries.
    const stamp = (row: any) =>
      (spec.table === "audit_log" || spec.table === "candidate_events") && row && typeof row === "object" ? { ...row, actor: user.name } : row;
    let payload = spec.payload;
    if (payload !== undefined) payload = Array.isArray(payload) ? payload.map(stamp) : stamp(payload);

    if (spec.table === "access_users" && spec.op !== "select") return fail("access_users is deprecated", "403");
    if (spec.table === "people" && spec.op === "insert" && Array.isArray(payload) && user.role !== "owner")
      return fail("Only the Owner can bulk import people", "403");

    const denied = checkSection(user, spec, payload);
    if (denied) return fail(denied, "403");

    const scope = user.role === "manager" ? await managerScope(user) : null;
    if (scope) {
      const denied = await checkManager(user, spec, payload, scope, db);
      if (denied) return fail(denied, "403");
    }

    let q: any = db.from(spec.table);
    if (spec.op === "select") q = q.select(spec.columns ?? "*", spec.selectOpts);
    else if (spec.op === "insert") q = q.insert(payload);
    else if (spec.op === "upsert") q = q.upsert(payload, spec.upsertOpts);
    else if (spec.op === "update") q = q.update(payload);
    else q = q.delete();

    q = applyFilters(q, spec.filters);
    if (scope && spec.op === "select") {
      if (spec.table === "people") q = q.in("id", [...scope.personIds]);
      else if (PERSON_TABLES.has(spec.table)) q = q.in("person_id", [...scope.personIds]);
    }
    if (spec.op !== "select" && spec.returning !== undefined && spec.returning !== null) q = q.select(spec.returning);
    for (const o of spec.order) q = q.order(o.col, o.opts);
    if (spec.limit) q = q.limit(spec.limit);
    if (spec.single === "single") q = q.single();
    if (spec.single === "maybe") q = q.maybeSingle();

    const { data, error, count } = await q;
    return { data: data ?? null, error: error ? { message: error.message, code: error.code } : null, count: count ?? null };
  });

/** Fields on people that belong to the manager assessment section. */
const ASSESSMENT_FIELDS = new Set(["assessed_skills", "assessed_at", "performance"]);

/**
 * Section ownership: HR profile + Career Profile are HR-edited; the manager
 * assessment (performance records, skill assessment) is manager-edited.
 * Owner may edit both.
 */
function checkSection(user: AppUser, spec: DbSpec, payload: any): string | null {
  if (spec.op === "select" || user.role === "owner") return null;
  const rows: any[] = payload === undefined ? [] : Array.isArray(payload) ? payload : [payload];
  if (user.role === "hr") {
    if (spec.table === "performance_records") return "Performance records are maintained by managers";
    if (spec.table === "people" && spec.op === "update" && rows.some((r) => Object.keys(r).some((k) => ASSESSMENT_FIELDS.has(k))))
      return "Skill assessment is maintained by managers";
  }
  if (user.role === "manager") {
    if (spec.table === "person_milestones" || spec.table === "person_lifecycle_events")
      return "This section is maintained by HR";
    if (spec.table === "people" && rows.some((r) => Object.keys(r).some((k) => !ASSESSMENT_FIELDS.has(k))))
      return "Profile information is maintained by HR";
  }
  return null;
}

async function checkManager(
  _user: AppUser,
  spec: DbSpec,
  payload: any,
  scope: { personIds: Set<string>; nodeIds: Set<string> },
  db: any,
): Promise<string | null> {
  if (spec.op === "select") return null;
  if (MANAGER_READONLY.has(spec.table)) return "Managers cannot change organization structure or roles";
  const rows: any[] = payload === undefined ? [] : Array.isArray(payload) ? payload : [payload];

  if (spec.table === "people") {
    if (spec.op !== "update") return "Managers cannot add or delete people";
    if (rows.some((r) => r.archived !== undefined || r.archived_at !== undefined || r.status === "left"))
      return "Managers cannot archive or restore people";
    if (rows.some((r) => r.org_node_id && !scope.nodeIds.has(r.org_node_id)))
      return "Cannot move a person outside your scope";
  }
  if (PERSON_TABLES.has(spec.table) && spec.op !== "update" && spec.op !== "delete") {
    if (rows.some((r) => r.person_id && !scope.personIds.has(r.person_id)))
      return "This person is outside your scope";
    return null;
  }
  // update / delete on scoped tables: verify every matched row is in scope
  if (spec.table === "people" || PERSON_TABLES.has(spec.table)) {
    const col = spec.table === "people" ? "id" : "person_id";
    const { data } = await applyFilters(db.from(spec.table).select(col), spec.filters);
    if ((data ?? []).some((r: any) => r[col] && !scope.personIds.has(r[col])))
      return "This person is outside your scope";
  }
  return null;
}

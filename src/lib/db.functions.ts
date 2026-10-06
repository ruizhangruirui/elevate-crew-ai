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
  "team_achievements",
  "team_achievement_contributors",
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

/** Tables a recruiter may read (Strategic Roles + Recruiting pages). */
const RECRUITER_READ = new Set(["roles", "directions", "orgs", "org_nodes", "config_items", "people", "candidates", "candidate_events"]);

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
    const stamp = (row: any) => {
      if (!row || typeof row !== "object") return row;
      if (spec.table === "audit_log" || spec.table === "candidate_events") return { ...row, actor: user.name };
      if (spec.table === "team_achievements") return { ...row, created_by: row.created_by ?? user.name };
      return row;
    };
    let payload = spec.payload;
    if (payload !== undefined) payload = Array.isArray(payload) ? payload.map(stamp) : stamp(payload);

    if (spec.table === "access_users" && spec.op !== "select") return fail("access_users is deprecated", "403");
    if (spec.table === "people" && spec.op === "insert" && Array.isArray(payload) && user.role !== "owner")
      return fail("Only the Owner can bulk import people", "403");

    const recruitingOnlyInsert = (Array.isArray(payload) ? payload : [payload]).every((r: any) => r?.recruiting_only === true);
    if (spec.table === "roles" && spec.op === "insert" && user.role !== "owner" && !(user.role === "hr" && recruitingOnlyInsert))
      return fail("Only the Owner can add strategic roles", "403");
    if (spec.table === "directions" && spec.op !== "select" && user.role !== "owner")
      return fail("Only the Owner can change strategy directions", "403");
    if (user.role === "recruiter") {
      if (!RECRUITER_READ.has(spec.table)) return fail("Recruiters can only access Strategic Roles and Recruiting", "403");
      if (spec.op !== "select" && spec.table !== "candidates" && spec.table !== "candidate_events")
        return fail("Recruiters can only maintain candidates", "403");
    }

    const denied = checkSection(user, spec, payload);
    if (denied) return fail(denied, "403");

    const scope = user.role === "manager" ? await managerScope(user) : null;
    if (scope) {
      const denied = await checkManager(user, spec, payload, scope, db);
      if (denied) return fail(denied, "403");
    }

    let q: any = (db as any).from(spec.table);
    if (spec.op === "select") q = q.select(spec.columns ?? "*", spec.selectOpts);
    else if (spec.op === "insert") q = q.insert(payload);
    else if (spec.op === "upsert") q = q.upsert(payload, spec.upsertOpts);
    else if (spec.op === "update") q = q.update(payload);
    else q = q.delete();

    q = applyFilters(q, spec.filters);
    if (scope && spec.op === "select") {
      if (spec.table === "people") q = q.in("id", [...scope.personIds]);
      else if (spec.table === "roles") q = q.in("org_node_id", [...scope.nodeIds]);
      else if (spec.table === "org_nodes") q = q.in("id", [...(await withAncestors(db, scope.nodeIds))]);
      else if (spec.table === "org_activities") {
        const { data: ps } = scope.personIds.size
          ? await db.from("org_activity_participants").select("activity_id").in("person_id", [...scope.personIds])
          : { data: [] };
        q = q.in("id", [...new Set((ps ?? []).map((p: any) => p.activity_id))]);
      }
      else if (spec.table === "team_achievements") q = q.in("org_node_id", [...scope.nodeIds]);
      else if (spec.table === "team_achievement_contributors") {
        const { data: achievements } = scope.nodeIds.size
          ? await (db as any).from("team_achievements").select("id").in("org_node_id", [...scope.nodeIds])
          : { data: [] };
        q = q.in("achievement_id", (achievements ?? []).map((row: any) => row.id));
      }
      else if (PERSON_TABLES.has(spec.table)) q = q.in("person_id", [...scope.personIds]);
      else if (spec.table === "candidates" || spec.table === "candidate_events") {
        const roleIds = await scopedRoleIds(db, scope.nodeIds);
        if (spec.table === "candidates") q = q.in("role_id", roleIds);
        else {
          const { data: cs } = roleIds.length ? await db.from("candidates").select("id").in("role_id", roleIds) : { data: [] };
          q = q.in("candidate_id", (cs ?? []).map((c: any) => c.id));
        }
      }
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
  if (spec.table === "team_achievements") {
    if (rows.some((row) => !row.org_node_id || !scope.nodeIds.has(row.org_node_id)))
      return "Team achievements must belong to a team inside your scope";
  }
  if (spec.table === "team_achievement_contributors" && spec.op === "insert") {
    if (rows.some((row) => row.person_id && !scope.personIds.has(row.person_id)))
      return "An achievement contributor is outside your scope";
  }
  if (spec.table === "team_achievements" && (spec.op === "update" || spec.op === "delete")) {
    const { data } = await applyFilters(db.from("team_achievements").select("org_node_id"), spec.filters);
    if ((data ?? []).some((row: any) => !row.org_node_id || !scope.nodeIds.has(row.org_node_id)))
      return "This team achievement is outside your scope";
  }
  if (spec.table === "team_achievement_contributors" && spec.op !== "insert") {
    const { data } = await applyFilters(db.from("team_achievement_contributors").select("achievement_id"), spec.filters);
    const achievementIds = [...new Set((data ?? []).map((row: any) => row.achievement_id).filter(Boolean))];
    if (achievementIds.length) {
      const { data: achievements } = await db.from("team_achievements").select("id,org_node_id").in("id", achievementIds);
      if ((achievements ?? []).some((row: any) => !row.org_node_id || !scope.nodeIds.has(row.org_node_id)))
        return "This team achievement is outside your scope";
    }
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

/** Roles whose team/lab lies inside the manager's scope. */
async function scopedRoleIds(db: any, nodeIds: Set<string>): Promise<string[]> {
  if (!nodeIds.size) return [];
  const { data } = await db.from("roles").select("id").in("org_node_id", [...nodeIds]);
  return (data ?? []).map((r: any) => r.id);
}

/** Scope nodes plus their ancestors, so managers still see the Lab above their Team. */
async function withAncestors(db: any, nodeIds: Set<string>): Promise<Set<string>> {
  const { data } = await db.from("org_nodes").select("id,parent_id");
  const parent = new Map<string, string | null>((data ?? []).map((n: any) => [n.id, n.parent_id]));
  const out = new Set<string>();
  for (const id of nodeIds) {
    let cur: string | null | undefined = id;
    while (cur && !out.has(cur)) { out.add(cur); cur = parent.get(cur); }
  }
  return out;
}

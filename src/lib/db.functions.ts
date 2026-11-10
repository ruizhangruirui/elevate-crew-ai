import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, getSessionUser, managerScope, type AppUser } from "./auth.server";
import { onboardingDateSchema } from "./candidate-onboarding";
import { missingRoleOwners, missingRoleOwnersOnUpdate } from "./role-owners";
import { isOwnerRole, canApprovePositions, positionApprovalAction } from "./app-roles";

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
  "reference_letters",
  "person_contracts",
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
  "reference_letters",
  "person_contracts",
]);
/** Structure tables managers may read but never change. */
const MANAGER_READONLY = new Set(["org_nodes", "roles", "directions", "orgs", "config_items", "access_users", "capability_snapshots", "candidates", "candidate_events"]);

/** Tables a recruiter may read (Positions + Recruiting pages). */
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
      if (spec.table === "actions") return positionApprovalAction(row);
      if (spec.table === "audit_log" || spec.table === "candidate_events") return { ...row, actor: user.name };
      if (spec.table === "person_contracts") return { ...row, uploaded_by: user.name };
      if (spec.table === "team_achievements") return { ...row, created_by: row.created_by ?? user.name };
      if (spec.table === "reference_letters") {
        const r = { ...row };
        if (spec.op === "insert") r.requested_by = user.name;
        if (r.status === "submitted") { r.submitted_by = user.name; r.submitted_at = new Date().toISOString(); }
        if (r.status === "approved") { r.approved_by = user.name; r.approved_at = new Date().toISOString(); }
        return r;
      }
      return row;
    };
    let payload = spec.payload;
    if (payload !== undefined) payload = Array.isArray(payload) ? payload.map(stamp) : stamp(payload);

    if (spec.table === "candidates" && spec.op !== "select" && payload !== undefined) {
      for (const row of Array.isArray(payload) ? payload : [payload]) {
        if (row?.onboarding_on !== undefined && !onboardingDateSchema.safeParse(row.onboarding_on).success)
          return fail("Invalid start date", "400");
      }
    }

    // Contract files are confidential: only HR and Owner-level roles may read or change them.
    if (spec.table === "person_contracts") {
      if (!isOwnerRole(user.role) && user.role !== "hr") return fail("Contracts are only available to HR", "403");
      if (spec.op === "update" || spec.op === "upsert") return fail("Upload a new contract instead", "400");
      for (const row of payload === undefined ? [] : Array.isArray(payload) ? payload : [payload]) {
        if (typeof row?.file_data !== "string" || row.file_data.length > 14_000_000) return fail("Contract file must be 10 MB or smaller", "400");
      }
    }
    if (spec.table === "access_users" && spec.op !== "select") return fail("access_users is deprecated", "403");
    if (spec.table === "people" && spec.op === "insert" && Array.isArray(payload) && !isOwnerRole(user.role))
      return fail("Only the Owner can bulk import people", "403");

    // Non-admin creation waits for HRD approval; assignment/sourcing remains a request.
    if (spec.table === "roles" && spec.op === "insert" && !isOwnerRole(user.role) && payload && !Array.isArray(payload)) {
      payload = { ...payload, approval_status: "pending", recruiting_archived: true, requested_by: user.name };
    }
    if (spec.table === "roles" && spec.op !== "select" && spec.op !== "insert" && payload) {
      const rows = Array.isArray(payload) ? payload : [payload];
      if (!canApprovePositions(user.role) && rows.some((r: any) => r && "approval_status" in r))
        return fail("Only the HR Director can approve positions", "403");
    }
    if (spec.table === "roles" && spec.op === "update" && !canApprovePositions(user.role) && payload && !Array.isArray(payload)) {
      const { data: targets, error } = await applyFilters(db.from("roles").select("approval_status"), spec.filters);
      if (error) return fail("Could not verify position approval", "400");
      if ((targets ?? []).some((r: any) => r.approval_status === "pending") && (payload as any).recruiting_archived === false)
        return fail("This position is waiting for HR Director approval", "403");
    }
    if (spec.table === "people" && spec.op !== "select" && !canApprovePositions(user.role) && payload) {
      const ids = (Array.isArray(payload) ? payload : [payload]).map((r: any) => r?.role_id).filter((x: unknown): x is string => typeof x === "string");
      if (ids.length) {
        const { data: pend } = await db.from("roles").select("id").in("id", ids).eq("approval_status", "pending");
        if ((pend ?? []).length) return fail("This position is waiting for HR Director approval", "403");
      }
    }
    const recruitingOnlyInsert = (Array.isArray(payload) ? payload : [payload]).every((r: any) => r?.recruiting_only === true);
    // HR/Recruiters add single positions from Positions (owner rules enforced by missingRoleOwners below).
    const hiringPositionInsert = !Array.isArray(payload);
    if (spec.table === "roles" && spec.op === "insert" && !isOwnerRole(user.role) && !((user.role === "hr" || user.role === "recruiter") && (recruitingOnlyInsert || hiringPositionInsert)))
      return fail("Only the Owner can add strategic roles", "403");
    // Every hiring position must name its recruiter and hiring supervisor at creation time.
    if (spec.table === "roles" && spec.op === "insert" && missingRoleOwners(payload))
      return fail("Each position needs a recruiter and a supervisor", "400");
    // A position re-entering Recruiting must still name its recruiter and hiring supervisor.
    if (spec.table === "roles" && spec.op === "update" && !Array.isArray(payload) && payload && "recruiting_archived" in payload && (payload as any).recruiting_archived === false) {
      const { data: targets, error } = await applyFilters(db.from("roles").select("recruiter_person_id,supervisor_person_id"), spec.filters);
      if (error) return fail("Could not verify position owners", "400");
      if (missingRoleOwnersOnUpdate(payload, targets ?? [])) return fail("Each position needs a recruiter and a supervisor", "400");
    }
    if (spec.table === "directions" && spec.op !== "select" && !isOwnerRole(user.role))
      return fail("Only the Owner can change strategy directions", "403");
    if (user.role === "recruiter") {
      const approvalTaskInsert = spec.table === "actions" && spec.op === "insert" && payload
        && (Array.isArray(payload) ? payload : [payload]).every((row: any) => row?.source_kind === "position_approval");
      if (!RECRUITER_READ.has(spec.table) && !approvalTaskInsert) return fail("Recruiters can only access Positions and Recruiting", "403");
      const roleWrite = spec.table === "roles" && (spec.op === "insert" || spec.op === "update");
      if (spec.op !== "select" && spec.table !== "candidates" && spec.table !== "candidate_events" && !roleWrite && !approvalTaskInsert)
        return fail("Recruiters can only maintain candidates and hiring roles", "403");
      // Recruiters may only fully archive recruiting-only roles; strategic positions are hidden from Recruiting instead.
      if (spec.table === "roles" && spec.op === "update" && payload && "archived" in payload) {
        const { data: targets, error } = await applyFilters(db.from("roles").select("recruiting_only"), spec.filters);
        if (error || (targets ?? []).some((r: any) => !r.recruiting_only)) return fail("Recruiters cannot archive Positions", "403");
      }
    }

    const denied = checkSection(user, spec, payload);
    if (denied) return fail(denied, "403");
    if (spec.table === "reference_letters" && spec.op !== "select") {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        if (row?.signature_mode !== undefined && !["hr", "supervisor", "both"].includes(row.signature_mode)) return fail("Invalid signature choice", "400");
        if (row?.supervisor_signature !== undefined && (typeof row.supervisor_signature !== "string" || row.supervisor_signature.length > 1000)) return fail("Invalid supervisor signature", "400");
      }
      if (spec.op === "update") {
        const { data: letters, error: readError } = await applyFilters(db.from("reference_letters").select("supervisor_person_id,status,signature_mode,supervisor_signature"), spec.filters);
        if (readError) return fail("Could not verify letter permissions", "403");
        if (user.role === "manager") {
          const ids = [...new Set<string>((letters ?? []).map((letter: any) => letter.supervisor_person_id).filter((id: unknown): id is string => typeof id === "string"))];
          const { data: supervisors, error } = await db.from("people").select("id,name").in("id", ids);
          if (error || (letters ?? []).some((letter: any) => letter.status !== "requested" || !(supervisors ?? []).some((person: any) => person.id === letter.supervisor_person_id && person.name === user.name))) return fail("Only the assigned supervisor can complete this request", "403");
        }
        if (payload?.status === "submitted" && (letters ?? []).some((letter: any) => (payload.signature_mode ?? letter.signature_mode ?? "hr") !== "hr" && !(payload.supervisor_signature ?? letter.supervisor_signature ?? "").trim())) return fail("Enter the supervisor signature text", "400");
      }
    }

    // Managers are always scoped; HRBPs are scoped when the Owner assigned Labs/Teams (empty = all data).
    const scoped = user.role === "manager" || (user.role === "hr" && user.scope_node_ids.length > 0);
    const scope = scoped ? await managerScope(user) : null;
    if (scope) {
      const denied = user.role === "manager"
        ? await checkManager(user, spec, payload, scope, db)
        : await checkHrScope(spec, payload, scope, db);
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
      else if (spec.table === "roles") {
        // Positions in scope = positions placed in the manager's teams + positions held by their people.
        const { data: held } = scope.personIds.size
          ? await db.from("people").select("role_id").in("id", [...scope.personIds])
          : { data: [] };
        const ids: string[] = [...new Set<string>([
          ...(await scopedRoleIds(db, scope.nodeIds)),
          ...(await sharedRoleIds(db, user)),
          ...((held ?? []) as { role_id: string | null }[]).map((p) => p.role_id).filter((x): x is string => !!x),
        ])];
        q = q.in("id", ids);
      }
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
        const roleIds = [...new Set([...(await scopedRoleIds(db, scope.nodeIds)), ...(await sharedRoleIds(db, user))])];
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

    // Action Center: scoped users only see/act on to-dos linked to their own Lab/Team.
    if (scope && spec.table === "actions" && (spec.op === "update" || spec.op === "delete")) {
      const { data: rows } = await applyFilters(db.from("actions").select("*"), spec.filters);
      const visible = await actionVisibility(db, user, scope);
      if ((rows ?? []).some((r: any) => !visible(r))) return fail("This to-do is outside your scope", "403");
    }

    if (spec.table === "actions" && spec.op !== "select" && spec.op !== "insert" && !canApprovePositions(user.role)) {
      const { data: tasks, error: readError } = await applyFilters(db.from("actions").select("source_kind"), spec.filters);
      if (readError) return fail("Could not verify approval task permissions", "403");
      if ((tasks ?? []).some((task: any) => task.source_kind === "position_approval")
        || (Array.isArray(payload) ? payload : [payload]).some((task: any) => task?.source_kind === "position_approval"))
        return fail("Only the HR Director can manage position approval tasks", "403");
    }

    const { data, error, count } = await q;
    let out: any = data ?? null;
    if (spec.table === "actions" && out) {
      const normalize = (row: any) => positionApprovalAction(row);
      out = Array.isArray(out) ? out.map(normalize) : normalize(out);
    }
    if (scope && spec.table === "actions" && spec.op === "select" && out) {
      const visible = await actionVisibility(db, user, scope);
      out = Array.isArray(out) ? out.filter(visible) : visible(out) ? out : null;
    }
    // Home address is HR-only: strip it for every other role.
    if (spec.table === "people" && out && !isOwnerRole(user.role) && user.role !== "hr") {
      const strip = (r: any) => { if (r && typeof r === "object") delete r.address; return r; };
      out = Array.isArray(out) ? out.map(strip) : strip(out);
    }
    return { data: out, error: error ? { message: error.message, code: error.code } : null, count: count ?? null };
  });

/** Fields on people that belong to the manager assessment section. */
const ASSESSMENT_FIELDS = new Set(["assessed_skills", "assessed_at", "performance"]);

/**
 * Section ownership: HR profile + Career Profile are HR-edited; the manager
 * assessment (performance records, skill assessment) is manager-edited.
 * Owner may edit both.
 */
function checkSection(user: AppUser, spec: DbSpec, payload: any): string | null {
  if (spec.op === "select" || isOwnerRole(user.role)) return null;
  const rows: any[] = payload === undefined ? [] : Array.isArray(payload) ? payload : [payload];
  if (spec.table === "reference_letters") {
    const MGR = new Set(["supervisor_text", "closing_text", "signature_mode", "supervisor_signature", "status", "submitted_by", "submitted_at"]);
    if (user.role === "manager") {
      if (spec.op !== "update") return "Reference letters are requested by HR";
      if (rows.some((r) => Object.keys(r).some((k) => !MGR.has(k)) || (r.status && r.status !== "submitted")))
        return "Supervisors can only write and submit their section";
    } else if (user.role === "hr") {
      if (rows.some((r) => r.supervisor_text !== undefined || r.signature_mode !== undefined || r.supervisor_signature !== undefined || r.status === "submitted"))
        return "The supervisor section is written by the supervisor";
    } else return "Not allowed";
    return null;
  }
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

/** HRBP writes: people and person-linked records must stay inside the assigned Labs/Teams. */
async function checkHrScope(
  spec: DbSpec,
  payload: any,
  scope: { personIds: Set<string>; nodeIds: Set<string> },
  db: any,
): Promise<string | null> {
  if (spec.op === "select") return null;
  const rows: any[] = payload === undefined ? [] : Array.isArray(payload) ? payload : [payload];
  if (spec.table === "people") {
    if (rows.some((r) => r.org_node_id && !scope.nodeIds.has(r.org_node_id)))
      return "Cannot place a person outside your scope";
    if (spec.op === "insert" && rows.some((r) => !r.org_node_id)) return "Choose a Lab/Team inside your scope";
  }
  if (spec.table === "team_achievements" && rows.some((r) => r.org_node_id && !scope.nodeIds.has(r.org_node_id)))
    return "This team is outside your scope";
  if (PERSON_TABLES.has(spec.table) && (spec.op === "insert" || spec.op === "upsert")) {
    if (rows.some((r) => r.person_id && !scope.personIds.has(r.person_id))) return "This person is outside your scope";
    return null;
  }
  if ((spec.table === "people" && spec.op !== "insert") || PERSON_TABLES.has(spec.table)) {
    const col = spec.table === "people" ? "id" : "person_id";
    const { data } = await applyFilters(db.from(spec.table).select(col), spec.filters);
    if ((data ?? []).some((r: any) => r[col] && !scope.personIds.has(r[col]))) return "This person is outside your scope";
  }
  return null;
}

/**
 * Which Action Center rows a scoped user may see. Person-linked to-dos (e.g. reference
 * letters) follow the person's Lab/Team, so only that team's lead and the Lab Director
 * see them; HR review to-dos are never shown to managers.
 */
async function actionVisibility(
  db: any,
  user: AppUser,
  scope: { personIds: Set<string>; nodeIds: Set<string> },
): Promise<(r: any) => boolean> {
  const roleIds = new Set(await scopedRoleIds(db, scope.nodeIds));
  return (r: any) => {
    if (user.role === "manager" && r.source_kind === "reference_review") return false;
    if (r.person_id) return scope.personIds.has(r.person_id);
    if (r.org_node_id) return scope.nodeIds.has(r.org_node_id);
    if (r.role_id) return roleIds.has(r.role_id);
    return true;
  };
}

/** Roles whose team/lab lies inside the manager's scope. */
async function scopedRoleIds(db: any, nodeIds: Set<string>): Promise<string[]> {
  if (!nodeIds.size) return [];
  const { data } = await db.from("roles").select("id").in("org_node_id", [...nodeIds]);
  return (data ?? []).map((r: any) => r.id);
}

/**
 * Recruiting positions explicitly shared with this account ("Visible to"). The account is
 * linked to a person by company email (case-insensitive), falling back to an exact name match.
 * Read-only: write checks are unchanged.
 */
async function sharedRoleIds(db: any, user: AppUser): Promise<string[]> {
  const { data: people } = await db.from("people").select("id,name,company_email").eq("archived", false);
  const email = user.email.trim().toLowerCase();
  const me = (people ?? []).filter((p: any) => (p.company_email ?? "").trim().toLowerCase() === email);
  const ids: string[] = (me.length ? me : (people ?? []).filter((p: any) => p.name === user.name)).map((p: any) => p.id);
  if (!ids.length) return [];
  const { data } = await db.from("roles").select("id,visible_to_person_ids").eq("archived", false);
  return (data ?? []).filter((r: any) => (r.visible_to_person_ids ?? []).some((id: string) => ids.includes(id))).map((r: any) => r.id);
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

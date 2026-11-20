import type { AppUser } from "./auth.server";
import { admin, managerScope } from "./auth.server";

type Db = Awaited<ReturnType<typeof admin>>;

export async function scopedRoleIds(db: Db, nodeIds: Set<string>): Promise<string[]> {
  if (!nodeIds.size) return [];
  const { data, error } = await db.from("roles").select("id").in("org_node_id", [...nodeIds]);
  if (error) throw new Error("Could not verify position scope");
  return (data ?? []).map((role) => role.id);
}

export async function sharedRoleIds(db: Db, user: AppUser): Promise<string[]> {
  const { data: people, error } = await db.from("people").select("id,name,company_email").eq("archived", false);
  if (error) throw new Error("Could not verify position sharing");
  const email = user.email.trim().toLowerCase();
  const matched = (people ?? []).filter((person) => (person.company_email ?? "").trim().toLowerCase() === email);
  const ids = (matched.length ? matched : (people ?? []).filter((person) => person.name === user.name)).map((person) => person.id);
  if (!ids.length) return [];
  const { data: roles, error: roleError } = await db.from("roles").select("id,visible_to_person_ids").eq("archived", false);
  if (roleError) throw new Error("Could not verify position sharing");
  return (roles ?? []).filter((role) => (role.visible_to_person_ids ?? []).some((id) => ids.includes(id))).map((role) => role.id);
}

/** Mirrors dbQuery role reads; person analysis never broadens manager/HR scope. */
export async function roleAnalysisScope(db: Db, user: AppUser, roleId: string, resolveScope: typeof managerScope = managerScope) {
  const scoped = user.role === "manager" || ((user.role === "hr" || user.role === "recruiter") && user.scope_node_ids.length > 0);
  if (!scoped) return null;
  const scope = await resolveScope(user);
  const held = user.role === "recruiter" || !scope.personIds.size
    ? []
    : (await db.from("people").select("role_id").in("id", [...scope.personIds])).data ?? [];
  const visible = new Set([
    ...await scopedRoleIds(db, scope.nodeIds),
    ...await sharedRoleIds(db, user),
    ...held.flatMap((person) => person.role_id ? [person.role_id] : []),
  ]);
  if (!visible.has(roleId)) throw new Error("This position is outside your scope");
  return scope;
}
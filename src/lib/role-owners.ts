/** A position entering Recruiting must name its recruiter and hiring supervisor; positions created outside Recruiting (recruiting_archived) don't. */
export function missingRoleOwners(payload: unknown): boolean {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((r: any) => r?.recruiting_archived !== true && (!r?.recruiter_person_id || !r?.supervisor_person_id));
}

/** On update, a position re-entering Recruiting keeps existing owners unless the payload changes them (explicit nulls count as cleared). */
export function missingRoleOwnersOnUpdate(payload: unknown, targets: Array<Record<string, unknown>>): boolean {
  const patch = (payload ?? {}) as Record<string, unknown>;
  const value = (row: Record<string, unknown>, key: string) => (key in patch ? patch[key] : row?.[key]);
  return targets.some((r) => !value(r, "recruiter_person_id") || !value(r, "supervisor_person_id"));
}

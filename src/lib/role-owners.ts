/** A position entering Recruiting must name its recruiter and hiring supervisor; positions created outside Recruiting (recruiting_archived) don't. */
export function missingRoleOwners(payload: unknown): boolean {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((r: any) => r?.recruiting_archived !== true && (!r?.recruiter_person_id || !r?.supervisor_person_id));
}

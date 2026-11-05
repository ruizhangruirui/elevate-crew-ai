/** Every hiring position must name its recruiter and hiring supervisor at creation time. */
export function missingRoleOwners(payload: unknown): boolean {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((r: any) => !r?.recruiter_person_id || !r?.supervisor_person_id);
}

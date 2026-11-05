/** A position entering Recruiting must name its recruiter and hiring supervisor; positions created outside Recruiting (recruiting_archived) don't. */
export function missingRoleOwners(payload: unknown): boolean {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((r: any) => r?.recruiting_archived !== true && (!r?.recruiter_person_id || !r?.supervisor_person_id));
}

/** On update, a position re-entering Recruiting keeps existing owners unless the payload changes them. */
export function missingRoleOwnersOnUpdate(payload: unknown, targets: Array<Record<string, unknown>>): boolean {
  const patch = (payload ?? {}) as Record<string, unknown>;
  return targets.some(
    (r) => !(patch["recruiter_person_id"] ?? r?.["recruiter_person_id"]) || !(patch["supervisor_person_id"] ?? r?.["supervisor_person_id"]),
  );
}

// Links Positions to Recruiting: a position's pipeline includes its own candidates
// plus candidates of recruiting-only roles whose title is exactly the same.
export type LinkRole = { id: string; title: string; recruiting_only?: boolean | null };
export type LinkCandidate = { id: string; role_id: string; name: string; outcome: string; onboarding_on?: string | null };

const norm = (s: string) => s.trim();

export function toOnboardByPosition(
  positions: LinkRole[],
  allRoles: LinkRole[],
  candidates: LinkCandidate[],
): Map<string, LinkCandidate[]> {
  const out = new Map<string, LinkCandidate[]>();
  for (const pos of positions) {
    const ids = new Set([pos.id]);
    for (const r of allRoles) if (r.recruiting_only && r.id !== pos.id && norm(r.title) === norm(pos.title)) ids.add(r.id);
    const list = candidates.filter((c) => c.outcome === "to_onboard" && ids.has(c.role_id));
    if (list.length) out.set(pos.id, list);
  }
  return out;
}

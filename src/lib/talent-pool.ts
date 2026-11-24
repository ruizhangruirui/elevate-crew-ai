/** Shared, client-safe talent pool types and helpers. */
export type TalentDirection = { direction: string; reason: string };
export type TalentRoleMatch = { role_id: string; role_title: string; fit_score: number; reason: string };
export type TalentBreakdown = { education: number; experience: number; projects: number; skills: number };

export type TalentRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
  headline: string | null;
  notes: string | null;
  category: string | null;
  tags: string[];
  source: string;
  teamtailor_candidate_id: string | null;
  teamtailor_applied_jobs: string[];
  current_company: string | null;
  previous_companies: string[];
  current_title?: string | null;
  education?: string[];
  previous_roles?: string[];
  contracted: boolean | null;
  ai_score: number | null;
  ai_summary: string | null;
  ai_directions: TalentDirection[];
  ai_breakdown: Partial<TalentBreakdown>;
  ai_role_matches: TalentRoleMatch[];
  ai_analyzed_at: string | null;
  archived: boolean;
  created_at: string;
  has_cv_text: boolean;
};

/** Clamp any AI score into 0–100 integers. */
export function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

/** Keep only matches pointing at roles we actually sent; strongest first, max 5. */
export function sanitizeMatches(matches: TalentRoleMatch[], roles: { id: string; title: string }[]): TalentRoleMatch[] {
  const byId = new Map(roles.map((r) => [r.id, r.title]));
  return matches
    .filter((m) => byId.has(m.role_id))
    .map((m) => ({ ...m, role_title: byId.get(m.role_id) as string, fit_score: clampScore(m.fit_score) }))
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 5);
}

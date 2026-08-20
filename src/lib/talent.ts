import { supabase } from "@/integrations/supabase/client";

export type Criticality = "strategic_critical" | "critical" | "important";

export type Org = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  tags: string[];
};

export type Direction = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  archived: boolean;
};

export type Skill = { skill: string; level: string };

export type Role = {
  id: string;
  direction_id: string;
  org_node_id?: string | null;
  title: string;
  description: string | null;
  level_min: number;
  level_max: number;
  target_count: number;
  criticality: string;
  sort_order: number;
  archived: boolean;
  domains: string[];
  knowledge: string[];
  leadership: string[];
  experience: string[];
  skills: Skill[];
  kpa: string | null;
  recommended_action: string[];
};

export type Person = {
  id: string;
  org_id: string;
  role_id: string | null;
  org_node_id?: string | null;
  name: string;
  level: number | null;
  status: string;
  note: string | null;
  contract_type?: string | null;
  tags?: string[];
  assessed_skills?: Skill[];
  performance?: string | null;
  tenure_months?: number | null;
  prior_experience?: string[];
  readiness?: string;
  attrition_risk?: string;
};

export const criticalityLabel: Record<string, string> = {
  strategic_critical: "Strategic Critical",
  critical: "Critical",
  important: "Important",
};

export async function fetchWorkspace() {
  const [orgs, directions, roles, people] = await Promise.all([
    supabase.from("orgs").select("*").limit(1),
    supabase.from("directions").select("*").eq("archived", false).order("sort_order"),
    supabase.from("roles").select("*").eq("archived", false).order("sort_order"),
    supabase.from("people").select("*").order("created_at"),
  ]);

  const err = orgs.error || directions.error || roles.error || people.error;
  if (err) throw err;

  return {
    org: (orgs.data?.[0] ?? null) as Org | null,
    directions: (directions.data ?? []) as Direction[],
    roles: ((roles.data ?? []) as unknown[]).map((r) => {
      const row = r as Record<string, unknown>;
      return { ...row, skills: Array.isArray(row["skills"]) ? row["skills"] : [] } as Role;
    }),
    people: ((people.data ?? []) as unknown[]).map((p) => {
      const row = p as Record<string, unknown>;
      return {
        ...row,
        assessed_skills: Array.isArray(row["assessed_skills"]) ? row["assessed_skills"] : [],
      } as Person;
    }),
  };
}

export function coverageOf(role: Role, people: Person[]) {
  const filled = people.filter((p) => p.role_id === role.id && p.status === "onboard").length;
  const gap = Math.max(0, role.target_count - filled);
  const state = gap === 0 ? "full" : filled === 0 ? "empty" : "partial";
  return { filled, gap, state } as const;
}
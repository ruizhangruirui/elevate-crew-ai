import { supabase } from "@/integrations/supabase/client";
import type { Person } from "./talent";

export type PerfRecord = {
  id: string;
  person_id: string;
  period: string;
  rating: string;
  summary: string | null;
  highlights: string | null;
  improvements: string | null;
  reviewer: string | null;
  recorded_on: string;
  created_at: string;
};

export type Milestone = {
  id: string;
  person_id: string;
  kind: string;
  title: string;
  detail: string | null;
  effective_on: string;
  issuer: string | null;
  from_level: number | null;
  to_level: number | null;
};

export async function fetchGrowthData() {
  const [perf, ms] = await Promise.all([
    supabase.from("performance_records").select("*").order("recorded_on", { ascending: false }),
    supabase.from("person_milestones").select("*").order("effective_on", { ascending: false }),
  ]);
  if (perf.error) throw perf.error;
  if (ms.error) throw ms.error;
  return {
    records: (perf.data ?? []) as unknown as PerfRecord[],
    milestones: (ms.data ?? []) as unknown as Milestone[],
  };
}

export const PERF_KEYS = ["exceeds", "meets", "below"] as const;
export const READINESS_KEYS = ["ready", "ready_1y", "ready_2y"] as const;
export type PerfKey = (typeof PERF_KEYS)[number];
export type ReadinessKey = (typeof READINESS_KEYS)[number];

/** Latest recorded rating wins, otherwise the manager-set field on the person. */
export function latestRating(person: Person, records: PerfRecord[]): string | null {
  const own = records
    .filter((r) => r.person_id === person.id)
    .sort((a, b) => (a.recorded_on < b.recorded_on ? 1 : -1));
  return own[0]?.rating ?? person.performance ?? null;
}

export function perfTone(rating: string | null): "ok" | "warn" | "danger" | "default" {
  if (rating === "exceeds") return "ok";
  if (rating === "below") return "danger";
  if (rating === "meets") return "default";
  return "default";
}

export function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

export function isWithin(dateStr: string, months: number): boolean {
  return new Date(dateStr) >= monthsAgo(months);
}

export type GrowthStats = {
  reviewed: number;
  total: number;
  coverage: number;
  ratingCounts: Record<string, number>;
  promotions12m: Milestone[];
  awards12m: Milestone[];
  readyNow: number;
  unreviewed: Person[];
};

export function growthStats(
  people: Person[],
  records: PerfRecord[],
  milestones: Milestone[],
): GrowthStats {
  const reviewedIds = new Set(records.map((r) => r.person_id));
  const ratingCounts: Record<string, number> = { exceeds: 0, meets: 0, below: 0, none: 0 };
  for (const p of people) {
    const r = latestRating(p, records);
    ratingCounts[r && r in ratingCounts ? r : "none"] =
      (ratingCounts[r && r in ratingCounts ? r : "none"] ?? 0) + 1;
  }
  const promotions12m = milestones.filter(
    (m) => m.kind === "promotion" && isWithin(m.effective_on, 12),
  );
  const awards12m = milestones.filter(
    (m) => (m.kind === "award" || m.kind === "certification") && isWithin(m.effective_on, 12),
  );
  const reviewed = people.filter((p) => reviewedIds.has(p.id)).length;
  return {
    reviewed,
    total: people.length,
    coverage: people.length ? Math.round((reviewed / people.length) * 100) : 0,
    ratingCounts,
    promotions12m,
    awards12m,
    readyNow: people.filter((p) => p.readiness === "ready").length,
    unreviewed: people.filter((p) => !reviewedIds.has(p.id)),
  };
}

/** 3x3 talent grid: performance (row) x readiness/potential (column). */
export function nineBox(people: Person[], records: PerfRecord[]) {
  const cells = new Map<string, Person[]>();
  for (const perf of PERF_KEYS) {
    for (const rd of READINESS_KEYS) cells.set(`${perf}:${rd}`, []);
  }
  for (const p of people) {
    const perf = latestRating(p, records);
    const rd = p.readiness ?? "unknown";
    if (!perf || !(PERF_KEYS as readonly string[]).includes(perf)) continue;
    if (!(READINESS_KEYS as readonly string[]).includes(rd)) continue;
    cells.get(`${perf}:${rd}`)?.push(p);
  }
  return cells;
}

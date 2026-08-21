import { supabase } from "@/integrations/supabase/client";
import { normalizeKey } from "./capability";
import type { Person } from "./talent";

export type ActivityKind =
  | "team_building"
  | "tech_share"
  | "meeting"
  | "training"
  | "retro"
  | "cross_team"
  | "recruiting";

/** 翻译 key，供 UI 层用 t() 取文案 */
export const activityKinds: { value: ActivityKind; labelKey: string; hintKey: string }[] = [
  { value: "team_building", labelKey: "cap.activityKind.team_building", hintKey: "cap.activityKindHint.team_building" },
  { value: "tech_share", labelKey: "cap.activityKind.tech_share", hintKey: "cap.activityKindHint.tech_share" },
  { value: "meeting", labelKey: "cap.activityKind.meeting", hintKey: "cap.activityKindHint.meeting" },
  { value: "training", labelKey: "cap.activityKind.training", hintKey: "cap.activityKindHint.training" },
  { value: "retro", labelKey: "cap.activityKind.retro", hintKey: "cap.activityKindHint.retro" },
  { value: "cross_team", labelKey: "cap.activityKind.cross_team", hintKey: "cap.activityKindHint.cross_team" },
  { value: "recruiting", labelKey: "cap.activityKind.recruiting", hintKey: "cap.activityKindHint.recruiting" },
];

export const activityKindLabelKey: Record<string, string> = Object.fromEntries(
  activityKinds.map((k) => [k.value, k.labelKey]),
);

/** 能力建设类活动：这些活动会直接标记到能力清单上 */
export const CAPACITY_KINDS: ActivityKind[] = ["tech_share", "training", "cross_team", "retro"];

export type Activity = {
  id: string;
  kind: string;
  title: string;
  happened_on: string;
  host: string | null;
  duration_minutes: number | null;
  direction_id: string | null;
  capability_tags: string[];
  link: string | null;
  note: string | null;
};

export type Participant = { id: string; activity_id: string; person_id: string };

export async function fetchOrgBuilding() {
  const [acts, parts] = await Promise.all([
    supabase.from("org_activities").select("*").order("happened_on", { ascending: false }),
    supabase.from("org_activity_participants").select("*"),
  ]);
  const err = acts.error || parts.error;
  if (err) throw err;
  return {
    activities: (acts.data ?? []) as Activity[],
    participants: (parts.data ?? []) as Participant[],
  };
}

export function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export type BuildingStats = {
  recent: Activity[];
  recentCount: number;
  byKind: { kind: string; count: number }[];
  participationRate: number;
  perPersonAvg: number;
  topPeople: { person: Person; count: number }[];
  dormant: Person[];
  lastDate: string | null;
};

export function buildingStats(
  activities: Activity[],
  participants: Participant[],
  people: Person[],
): BuildingStats {
  const since = daysAgo(90);
  const recent = activities.filter((a) => a.happened_on >= since);
  const recentIds = new Set(recent.map((a) => a.id));
  const onboard = people.filter((p) => p.status === "onboard");

  const counts = new Map<string, number>();
  for (const p of participants) {
    if (!recentIds.has(p.activity_id)) continue;
    counts.set(p.person_id, (counts.get(p.person_id) ?? 0) + 1);
  }

  const byKindMap = new Map<string, number>();
  for (const a of recent) byKindMap.set(a.kind, (byKindMap.get(a.kind) ?? 0) + 1);

  const joined = onboard.filter((p) => (counts.get(p.id) ?? 0) > 0);
  const totalJoins = [...counts.values()].reduce((a, b) => a + b, 0);

  return {
    recent,
    recentCount: recent.length,
    byKind: activityKinds
      .map((k) => ({ kind: k.value, count: byKindMap.get(k.value) ?? 0 }))
      .filter((k) => k.count > 0),
    participationRate: onboard.length ? Math.round((joined.length / onboard.length) * 100) : 0,
    perPersonAvg: onboard.length ? Math.round((totalJoins / onboard.length) * 10) / 10 : 0,
    topPeople: onboard
      .map((person) => ({ person, count: counts.get(person.id) ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    dormant: onboard.filter((p) => !(counts.get(p.id) ?? 0)),
    lastDate: activities[0]?.happened_on ?? null,
  };
}

/** 找出针对某项能力的近期建设活动（标签或标题命中） */
export function activitiesForCapability(activities: Activity[], label: string) {
  const key = normalizeKey(label);
  if (!key) return [];
  const since = daysAgo(180);
  return activities.filter((a) => {
    if (a.happened_on < since) return false;
    if (!CAPACITY_KINDS.includes(a.kind as ActivityKind)) return false;
    const hay = [...(a.capability_tags ?? []), a.title].map(normalizeKey);
    return hay.some((h) => h && (h.includes(key) || key.includes(h)));
  });
}

import { supabase } from "@/integrations/supabase/client";

export type LifecycleEvent = {
  id: string;
  person_id: string;
  event_type: "join" | "exit" | string;
  reason: string | null;
  detail: string | null;
  effective_on: string;
  recorded_by: string | null;
  created_at: string;
};

export const EXIT_REASONS = [
  "voluntary",
  "termination",
  "internship_end",
  "contract_end",
  "transfer_out",
  "other",
] as const;

export const JOIN_REASONS = ["new_hire", "candidate_converted", "transfer_in", "rehire"] as const;

export const reasonLabelKey = (reason: string | null) =>
  reason ? `lc.reason.${reason}` : "lc.reason.other";

export async function fetchLifecycleEvents() {
  const { data, error } = await supabase
    .from("person_lifecycle_events")
    .select("*")
    .order("effective_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LifecycleEvent[];
}

export async function fetchArchivedPeople() {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("archived", true)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    name: string;
    level: number | null;
    role_id: string | null;
    archived_at: string | null;
  }[];
}

export async function recordJoin(
  personId: string,
  opts: { reason?: string; detail?: string; effective_on?: string } = {},
) {
  const { error } = await supabase.from("person_lifecycle_events").insert({
    person_id: personId,
    event_type: "join",
    reason: opts.reason ?? "new_hire",
    detail: opts.detail ?? null,
    effective_on: opts.effective_on ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

/** 记录离职并归档：人不再出现在名单里，但历史保留 */
export async function archivePerson(
  personId: string,
  opts: { reason: string; detail?: string; effective_on: string },
) {
  const { error } = await supabase.from("person_lifecycle_events").insert({
    person_id: personId,
    event_type: "exit",
    reason: opts.reason,
    detail: opts.detail ?? null,
    effective_on: opts.effective_on,
  });
  if (error) throw error;
  const { error: e2 } = await supabase
    .from("people")
    .update({ archived: true, archived_at: new Date().toISOString(), status: "left", role_id: null })
    .eq("id", personId);
  if (e2) throw e2;
}

export async function restorePerson(personId: string) {
  const { error } = await supabase
    .from("people")
    .update({ archived: false, archived_at: null, status: "onboard" })
    .eq("id", personId);
  if (error) throw error;
  await recordJoin(personId, { reason: "rehire" });
}

export function monthKey(d: string) {
  return d.slice(0, 7);
}

export type FlowStats = {
  joins90: number;
  exits90: number;
  net90: number;
  byMonth: { month: string; joins: number; exits: number }[];
  exitReasons: { reason: string; count: number }[];
};

export function flowStats(events: LifecycleEvent[], months = 6): FlowStats {
  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const joins90 = events.filter((e) => e.event_type === "join" && e.effective_on >= since90).length;
  const exits90 = events.filter((e) => e.event_type === "exit" && e.effective_on >= since90).length;

  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const byMonth = keys.map((month) => ({
    month,
    joins: events.filter((e) => e.event_type === "join" && monthKey(e.effective_on) === month).length,
    exits: events.filter((e) => e.event_type === "exit" && monthKey(e.effective_on) === month).length,
  }));

  const rmap = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "exit") continue;
    const r = e.reason ?? "other";
    rmap.set(r, (rmap.get(r) ?? 0) + 1);
  }

  return {
    joins90,
    exits90,
    net90: joins90 - exits90,
    byMonth,
    exitReasons: [...rmap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

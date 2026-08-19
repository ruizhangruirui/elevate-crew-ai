import { supabase } from "@/integrations/supabase/client";

export type Snapshot = {
  id: string;
  taken_on: string;
  scope_node_id: string | null;
  total_caps: number;
  covered_caps: number;
  blank_caps: number;
  single_caps: number;
  coverage_rate: number;
  onboard_people: number;
  target_seats: number;
  activities_90d: number;
};

export async function fetchSnapshots() {
  const { data, error } = await supabase
    .from("capability_snapshots")
    .select("*")
    .order("taken_on", { ascending: true })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as Snapshot[];
}

export async function recordSnapshot(row: Omit<Snapshot, "id" | "taken_on">) {
  const taken_on = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("capability_snapshots")
    .upsert({ ...row, taken_on }, { onConflict: "taken_on,scope_node_id" });
  if (error) {
    // 部分索引使用 COALESCE，冲突时退化为先删后插
    await supabase.from("capability_snapshots").delete().eq("taken_on", taken_on).is("scope_node_id", null);
    const { error: e2 } = await supabase.from("capability_snapshots").insert({ ...row, taken_on });
    if (e2) throw e2;
  }
}

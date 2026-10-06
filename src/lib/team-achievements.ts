import { db } from "@/lib/db-client";

export type TeamAchievement = {
  id: string;
  achievement_type: string;
  title: string;
  achieved_on: string;
  org_node_id: string | null;
  link: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AchievementContributor = {
  id: string;
  achievement_id: string;
  person_id: string;
};

export async function fetchTeamAchievements() {
  const [achievements, contributors, types] = await Promise.all([
    db.from("team_achievements").select("*").order("achieved_on", { ascending: false }),
    db.from("team_achievement_contributors").select("*"),
    db
      .from("config_items")
      .select("*")
      .eq("category", "achievementTypes")
      .eq("active", true)
      .order("sort_order"),
  ]);
  const error = achievements.error || contributors.error || types.error;
  if (error) throw error;
  return {
    achievements: (achievements.data ?? []) as TeamAchievement[],
    contributors: (contributors.data ?? []) as AchievementContributor[],
    types: (types.data ?? []) as { id: string; name: string }[],
  };
}
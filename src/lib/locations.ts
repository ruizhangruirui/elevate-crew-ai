import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db-client";

export const EMPLOYMENT_MODES = ["local", "hq_dispatch"] as const;

export function employmentModeLabel(t: (k: string) => string, v?: string | null): string | null {
  if (!v) return null;
  return v === "local" ? t("loc.mode.local") : v === "hq_dispatch" ? t("loc.mode.hq") : v;
}

/** Active work locations configured in Settings (category "locations"). */
export function useLocations() {
  return useQuery({
    queryKey: ["config", "locations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("config_items")
        .select("name,sort_order")
        .eq("category", "locations")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return ((data ?? []) as { name: string }[]).map((r) => r.name);
    },
  });
}

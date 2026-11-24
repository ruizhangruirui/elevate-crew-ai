import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RecruitingTabs } from "@/components/RecruitingTabs";
import { TalentPoolBoard } from "@/components/TalentPoolBoard";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/recruiting_/talent")({
  head: () => ({
    meta: [
      { title: "Talent Pool · Talent Management" },
      { name: "description", content: "Keep promising candidates, sync them from TeamTailor and get AI scores and position matches." },
      { property: "og:title", content: "Talent Pool · Talent Management" },
      { property: "og:description", content: "AI-assisted talent pool with CV-based scores, suitable directions and open position matches." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => {
    const { user } = useAuth();
    const isManager = user?.role === "manager";
    return (
      <AppShell title="Recruiting">
        <RecruitingTabs active="talent" />
        <TalentPoolBoard readOnly={isManager} />
      </AppShell>
    );
  },
});

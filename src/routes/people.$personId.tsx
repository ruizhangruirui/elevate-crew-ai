import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PersonProfile } from "@/components/PersonProfile";
import { RoleDetailSheet } from "@/components/RoleDetailSheet";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace } from "@/lib/talent";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/people/$personId")({
  head: () => ({
    meta: [
      { title: "人员档案 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "查看单个人员的 HR 档案与主管评估：基础信息、晋升奖项、绩效与技能评估。",
      },
      { property: "og:title", content: "人员档案 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "查看单个人员的 HR 档案与主管评估：基础信息、晋升奖项、绩效与技能评估。",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PersonPage,
});

function PersonPage() {
  const { personId } = Route.useParams();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);

  const person = data?.people.find((p) => p.id === personId) ?? null;
  const role = person?.role_id ? (data?.roles.find((r) => r.id === person.role_id) ?? null) : null;
  const direction = role
    ? (data?.directions.find((d) => d.id === role.direction_id) ?? null)
    : null;

  return (
    <AppShell
      title={person?.name ?? t("ppl.loading")}
      subtitle={
        role ? `${direction?.title ?? ""} · ${role.title}` : t("sheet.person.unassignedRole")
      }
    >
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/people">
            <ArrowLeft className="size-4" /> {t("pp.back")}
          </Link>
        </Button>

        {!data ? (
          <p className="text-sm text-muted-foreground">{t("ppl.loading")}</p>
        ) : !person ? (
          <p className="text-sm text-muted-foreground">{t("pp.notFound")}</p>
        ) : (
          <PersonProfile
            person={person}
            people={data.people}
            roles={data.roles}
            directions={data.directions}
            onDone={() => qc.invalidateQueries({ refetchType: "all" })}
            onOpenRole={(rid) => setActiveRoleId(rid)}
          />
        )}

        <RoleDetailSheet
          role={data?.roles.find((r) => r.id === activeRoleId) ?? null}
          people={data?.people ?? []}
          directionTitle={
            data?.directions.find(
              (d) => d.id === data?.roles.find((r) => r.id === activeRoleId)?.direction_id,
            )?.title ?? ""
          }
          open={!!activeRoleId}
          onOpenChange={(v) => !v && setActiveRoleId(null)}
          onDone={() => qc.invalidateQueries({ refetchType: "all" })}
        />
      </div>
    </AppShell>
  );
}

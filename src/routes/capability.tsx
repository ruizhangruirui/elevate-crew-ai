import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, Info, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ActivityDialog } from "@/components/ActivityDialog";
import { ConfirmAction } from "@/components/ConfirmAction";
import { AddActionButton } from "@/components/AddActionButton";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorkspace, criticalityLabel } from "@/lib/talent";
import {
  buildCapabilities,
  capabilityHealth,
  vacancyClusters,
  type Capability,
} from "@/lib/capability";
import {
  activitiesForCapability,
  buildingStats,
  fetchOrgBuilding,
  type Activity,
  type Participant,
} from "@/lib/org-building";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchOrgNodes, peopleInSubtree, type OrgNode } from "@/lib/org-tree";
import { fetchSnapshots, recordSnapshot, type Snapshot } from "@/lib/snapshots";
import { fetchLifecycleEvents, flowStats } from "@/lib/lifecycle";

export const Route = createFileRoute("/capability")({
  validateSearch: (search: Record<string, unknown>) => ({
    scope: typeof search["scope"] === "string" ? (search["scope"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "组织能力视图 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "按根因看清能力缺口是招聘问题还是培养问题，并记录团建、技术分享等组织建设活动。",
      },
      { property: "og:title", content: "组织能力视图 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "按根因看清能力缺口是招聘问题还是培养问题，并记录团建、技术分享等组织建设活动。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CapabilityPage,
});

function CapabilityPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t("cap.title")} subtitle={t("cap.subtitle")}>
      <CapabilityBody />
    </AppShell>
  );
}

function CapabilityBody() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: building } = useQuery({ queryKey: ["org-building"], queryFn: fetchOrgBuilding });
  const { data: nodes } = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const { scope: scopeParam } = useSearch({ from: "/capability" });
  const scope = scopeParam ?? "__all__";
  const navigate = useNavigate({ from: "/capability" });
  const setScope = (v: string) =>
    navigate({ search: { scope: v === "__all__" ? undefined : v }, replace: true });

  if (!data) return <div className="text-sm text-muted-foreground">{t("cap.loading")}</div>;

  const allNodes = nodes ?? [];
  const scopedPeople =
    scope === "__all__" ? data.people : peopleInSubtree(data.people, allNodes, scope);
  const scopedRoleIds = new Set(scopedPeople.map((p) => p.role_id).filter(Boolean) as string[]);
  const scoped =
    scope === "__all__"
      ? data
      : {
          ...data,
          people: scopedPeople,
          roles: data.roles.filter((r) => scopedRoleIds.has(r.id)),
        };
  const scopeName = allNodes.find((n) => n.id === scope)?.name ?? t("cap.scopeAll");

  const scopedPersonIds = new Set(scopedPeople.map((p) => p.id));
  const scopedBuilding = (() => {
    if (!building) return null;
    if (scope === "__all__") return building;
    const participants = building.participants.filter((p) => scopedPersonIds.has(p.person_id));
    const keep = new Set(participants.map((p) => p.activity_id));
    return {
      activities: building.activities.filter((a) => keep.has(a.id)),
      participants,
    };
  })();

  return (
    <Tabs defaultValue="building" className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="building">{t("cap.tab.building")}</TabsTrigger>
          <TabsTrigger value="trend">{t("cap.tab.trend")}</TabsTrigger>
          <TabsTrigger value="health">{t("cap.tab.health")}</TabsTrigger>
        </TabsList>
        <ScopePicker nodes={allNodes} scope={scope} scopeName={scopeName} onChange={setScope} />

      </div>
      {scope !== "__all__" && (
        <p className="-mt-4 text-xs text-muted-foreground">
          {t("cap.scopeNotePrefix")} <b className="text-foreground">{scopeName}</b> {t("cap.scopeNoteSuffix")}
        </p>
      )}
      <TabsContent value="health">
        <HealthPanel data={scoped} activities={scopedBuilding?.activities ?? []} />
      </TabsContent>
      <TabsContent value="building">
        <BuildingPanel data={scoped} building={scopedBuilding} />
      </TabsContent>
      <TabsContent value="trend">
        <TrendPanel data={scoped} activities={scopedBuilding?.activities ?? []} />
      </TabsContent>
    </Tabs>
  );
}

/** 可折叠的范围选择：默认只显示当前范围，点开才展开 Lab → Team 树 */
function ScopePicker({
  nodes,
  scope,
  scopeName,
  onChange,
}: {
  nodes: OrgNode[];
  scope: string;
  scopeName: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const roots = nodes.filter((n) => !n.parent_id);
  const childrenOf = (id: string) => nodes.filter((n) => n.parent_id === id);

  const Row = ({ node, depth }: { node: OrgNode; depth: number }) => (
    <>
      <button
        type="button"
        onClick={() => {
          onChange(node.id);
          setOpen(false);
        }}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        className={`flex w-full items-center justify-between rounded-md py-1.5 pr-3 text-left text-xs transition-colors hover:bg-surface-raised ${
          scope === node.id ? "bg-brand/15 text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="truncate">{node.name}</span>
        <span className="ml-2 shrink-0 text-[10px] opacity-60">{node.type}</span>
      </button>
      {childrenOf(node.id).map((c) => (
        <Row key={c.id} node={c} depth={depth + 1} />
      ))}
    </>
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
      >
        <span>{t("cap.scopeLabel")}:</span>
        <b className="text-foreground">{scopeName}</b>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onChange("__all__");
                setOpen(false);
              }}
              className={`flex w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-raised ${
                scope === "__all__" ? "bg-brand/15 text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("cap.scopeAll")}
            </button>
            {roots.map((n) => (
              <Row key={n.id} node={n} depth={0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}



/* ---------------------------------- 能力体检 --------------------------------- */

type Workspace = NonNullable<Awaited<ReturnType<typeof fetchWorkspace>>>;

function HealthPanel({ data, activities }: { data: Workspace; activities: Activity[] }) {
  const { t } = useI18n();
  const [dirId, setDirId] = useState<string | null>(null);
  const caps = useMemo(() => buildCapabilities(data.roles, data.people), [data]);

  useEffect(() => {
    if (!dirId && data.directions[0]) setDirId(data.directions[0].id);
  }, [data, dirId]);

  const active = data.directions.find((d) => d.id === dirId) ?? data.directions[0] ?? null;
  const dirCaps = active ? caps.filter((c) => c.directionIds.includes(active.id)) : [];
  const health = capabilityHealth(dirCaps);

  const clusters = vacancyClusters(dirCaps, data.roles);
  const gaps = dirCaps.filter((c) => c.rootCause === "gap");
  const singles = dirCaps.filter((c) => c.status === "single");
  const thins = dirCaps.filter((c) => c.status === "thin");
  const covered = dirCaps.filter((c) => c.status === "covered");

  return (
    <div className="space-y-8">
      <section className="panel p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("cap.health.title")}</p>
        <p className="mt-3 max-w-3xl font-display text-xl leading-relaxed md:text-2xl">
          {active?.title ?? t("cap.health.defaultDirection")}{t("cap.health.summary1")} <Num n={health.total} tone="brand" /> {t("cap.health.summary2")}{" "}
          <Num n={health.vacancyDriven} tone="muted" /> {t("cap.health.summary3")}
          <strong className="text-foreground">{t("cap.health.summaryStrong")}</strong>{t("cap.health.summary4")}{" "}
          <Num n={gaps.length + singles.length + thins.length} tone="warn" /> {t("cap.health.summary5")}{" "}
          <Num n={covered.length} tone="ok" /> {t("cap.health.summary6")}
        </p>

        <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="flex h-full">
            <Bar value={health.vacancyDriven} total={health.total} className="bg-muted-foreground/50" />
            <Bar value={gaps.length} total={health.total} className="bg-danger" />
            <Bar value={singles.length + thins.length} total={health.total} className="bg-warn" />
            <Bar value={covered.length} total={health.total} className="bg-ok" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <Legend className="bg-muted-foreground/50" label={`${t("cap.legend.vacancy")} ${health.vacancyDriven}`} />
          <Legend className="bg-danger" label={`${t("cap.legend.gap")} ${gaps.length}`} />
          <Legend className="bg-warn" label={`${t("cap.legend.short")} ${singles.length + thins.length}`} />
          <Legend className="bg-ok" label={`${t("cap.legend.covered")} ${covered.length}`} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {data.directions.map((d) => {
            const list = caps.filter((c) => c.directionIds.includes(d.id));
            const risky = list.filter(
              (c) => c.rootCause === "gap" || c.status === "single" || c.status === "thin",
            ).length;
            const on = d.id === active?.id;
            return (
              <button
                key={d.id}
                onClick={() => setDirId(d.id)}
                className={`rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                  on
                    ? "border-brand/60 bg-brand/10 text-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="block font-medium">{d.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {list.length} {t("cap.dir.capCount")} · {risky} {t("cap.dir.needCover")}
                </span>
              </button>
            );
          })}
        </div>

        {/* 根因一：岗位空缺 */}
        {clusters.length > 0 && (
          <div className="panel overflow-hidden">
            <div className="border-b border-border/50 px-5 py-4">
              <h3 className="font-display text-base font-semibold">{t("cap.vacancy.title")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("cap.vacancy.desc")}</p>
            </div>
            <ul className="divide-y divide-border/40">
              {clusters.map((c) => (
                <VacancyRow
                  key={c.role.id}
                  roleId={c.role.id}
                  title={c.role.title}
                  crit={c.role.criticality}
                  caps={c.caps}
                />
              ))}
            </ul>
          </div>
        )}

        {/* 根因二：人在但能力不在 */}
        <Group
          title={t("cap.group.gapTitle")}
          desc={t("cap.group.gapDesc")}
          tone="text-danger"
          list={gaps}
          activities={activities}
        />
        <Group
          title={t("cap.group.singleTitle")}
          desc={t("cap.group.singleDesc")}
          tone="text-warn"
          list={singles}
          activities={activities}
        />
        <Group
          title={t("cap.group.thinTitle")}
          desc={t("cap.group.thinDesc")}
          tone="text-warn"
          list={thins}
          activities={activities}
        />
        <Collapsed
          title={`${t("cap.group.coveredLabel")} ${covered.length} ${t("cap.group.items")}`}
          list={covered}
          activities={activities}
        />

        {dirCaps.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("cap.group.noProfile")}</p>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t("cap.footer.info")}
      </p>
    </div>
  );
}

function VacancyRow({
  title,
  crit,
  caps,
  roleId,
}: {
  title: string;
  crit: string;
  caps: Capability[];
  roleId: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
      >
        <UserPlus className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("cap.vacancyRow.prefix")}{title}{t("cap.vacancyRow.suffix")}</span>
        <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {criticalityLabel[crit] ?? crit}
        </span>
        <span className="text-xs text-muted-foreground">{t("cap.vacancyRow.impactPrefix")} {caps.length} {t("cap.vacancyRow.impactSuffix")}</span>
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div className="mt-2">
        <AddActionButton
          sourceKind="vacancy"
          sourceKey={`vacancy:${roleId}`}
          roleId={roleId}
          defaultTitle={`${t("cap.vacancyRow.actionTitlePrefix")}${title}${t("cap.vacancyRow.actionTitleSuffix")}`}
          defaultDetail={`${t("cap.vacancyRow.detailPrefix")} ${caps.length} ${t("cap.vacancyRow.detailMid")}${caps.map((c) => c.label).join("、")}`}
          defaultPriority="high"
          label={t("cap.vacancyRow.actionLabel")}
        />
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {caps.map((c) => (
            <span
              key={c.key}
              className="rounded bg-muted/30 px-2 py-1 text-xs text-muted-foreground"
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function Group({
  title,
  desc,
  tone,
  list,
  activities,
}: {
  title: string;
  desc: string;
  tone: string;
  list: Capability[];
  activities: Activity[];
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  if (!list.length) return null;
  const visible = showAll ? list : list.slice(0, 6);
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 px-5 py-4">
        <span className={`size-2 rounded-full ${tone.replace("text-", "bg-")}`} />
        <h3 className={`font-display text-base font-semibold ${tone}`}>{title}</h3>
        <span className="font-display text-sm tabular-nums text-muted-foreground">
          {list.length} {t("cap.group.items")}
        </span>
        <p className="w-full text-xs text-muted-foreground sm:w-auto">{desc}</p>
      </div>
      <ul className="divide-y divide-border/40">
        {visible.map((c) => (
          <CapRow key={c.key} cap={c} activities={activities} />
        ))}
      </ul>
      {list.length > 6 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border/40 px-5 py-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {showAll ? t("cap.group.collapse") : `${t("cap.group.expandPrefix")} ${list.length - 6} ${t("cap.group.expandSuffix")}`}
        </button>
      )}
    </div>
  );
}

function Collapsed({
  title,
  list,
  activities,
}: {
  title: string;
  list: Capability[];
  activities: Activity[];
}) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="size-2 rounded-full bg-ok" />
        <h3 className="font-display text-base font-semibold text-ok">{title}</h3>
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="divide-y divide-border/40 border-t border-border/40">
          {list.map((c) => (
            <CapRow key={c.key} cap={c} activities={activities} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CapRow({ cap, activities }: { cap: Capability; activities: Activity[] }) {
  const { t } = useI18n();
  const built = activitiesForCapability(activities, cap.label);
  const suggestion = t(`cap.suggestion.${cap.suggestionKey}`);
  return (
    <li className="space-y-1.5 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{cap.label}</span>
        <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t(`cap.kind.${cap.kind}`)}
        </span>
        {cap.aliases.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t("cap.caprow.merged")}{cap.aliases.join("、")}
          </span>
        )}
        {built.length > 0 && (
          <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] text-ok">
            {t("cap.caprow.built")} · {built.length} {t("cap.caprow.times")}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {cap.carriers.length
            ? cap.carriers.map((c) => c.person.name).join("、")
            : t("cap.caprow.noCarrier")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("cap.caprow.from")} {cap.roleTitles.join(" / ")}</span>
        <span className="text-brand">{t("cap.caprow.nextStep")}{suggestion}</span>
        {cap.status !== "covered" && (
          <AddActionButton
            sourceKind="capability"
            sourceKey={`capability:${cap.key}`}
            roleId={cap.roleIds[0] ?? null}
            defaultTitle={`${cap.label}：${suggestion}`}
            defaultDetail={`${t("cap.caprow.detail1")}${cap.label}${t("cap.caprow.detail2")}${
              cap.status === "blank" ? t("cap.status.blank") : cap.status === "single" ? t("cap.group.singleTitle") : t("cap.group.thinTitle")
            }${t("cap.caprow.detail3")} ${cap.roleTitles.join(" / ")}${t("cap.caprow.detail4")}${
              cap.carriers.map((c) => c.person.name).join("、") || t("cap.common.none")
            }${t("cap.caprow.detail5")}`}
            defaultPriority={cap.status === "blank" ? "high" : "normal"}
          />
        )}
      </div>
    </li>
  );
}

/* ---------------------------------- 组织建设 --------------------------------- */

function BuildingPanel({
  data,
  building,
}: {
  data: Workspace;
  building: { activities: Activity[]; participants: Participant[] } | null;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  const activities = building?.activities ?? [];
  const participants = building?.participants ?? [];
  const stats = useMemo(
    () => buildingStats(activities, participants, data.people),
    [activities, participants, data.people],
  );

  const caps = useMemo(() => buildCapabilities(data.roles, data.people), [data]);
  const singleRisk = caps.filter((c) => c.status === "single").slice(0, 4);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("cap.records.deleteToast"));
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const peopleById = new Map(data.people.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("cap.tile.recentActivities")} value={stats.recentCount} unit={t("cap.unit.session")} />
        <Tile label={t("cap.tile.participation")} value={stats.participationRate} unit={t("cap.unit.percent")} />
        <Tile label={t("cap.tile.avgParticipation")} value={stats.perPersonAvg} unit={t("cap.unit.times")} />
        <Tile label={t("cap.tile.dormant")} value={stats.dormant.length} unit={t("cap.unit.people")} tone={stats.dormant.length ? "warn" : "ok"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h3 className="font-display text-base font-semibold">{t("cap.structure.title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("cap.structure.desc")}
          </p>
          <div className="mt-4 space-y-2">
            {stats.byKind.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("cap.structure.empty")}</p>
            )}
            {stats.byKind.map((k) => (
              <div key={k.kind} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{t(`cap.activityKind.${k.kind}`)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${(k.count / stats.recentCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-muted-foreground">{k.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4 p-5">
          <div>
            <h3 className="font-display text-base font-semibold">{t("cap.vibe.title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("cap.vibe.desc")}</p>
          </div>
          <div className="space-y-1 text-sm">
            {stats.topPeople.map(({ person, count }) => (
              <div key={person.id} className="flex justify-between">
                <span>{person.name}</span>
                <span className="tabular-nums text-muted-foreground">{count} {t("cap.unit.times")}</span>
              </div>
            ))}
            {stats.topPeople.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("cap.vibe.empty")}</p>
            )}
          </div>
          {stats.dormant.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
              <p className="font-medium text-warn">{t("cap.vibe.dormantTitle")}</p>
              <p className="mt-1 text-muted-foreground">
                {stats.dormant.map((p) => p.name).join("、")}
              </p>
            </div>
          )}
        </div>
      </section>

      {singleRisk.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-display text-base font-semibold">{t("cap.suggestBuild.title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("cap.suggestBuild.desc")}
          </p>
          <div className="mt-4 space-y-2">
            {singleRisk.map((c) => (
              <div
                key={c.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 px-4 py-2.5 text-sm"
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground">
                  {t("cap.suggestBuild.carriedPrefix")} {c.carriers.map((x) => x.person.name).join("、")} {t("cap.suggestBuild.carriedSuffix")}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto gap-1.5 text-xs"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="size-3.5" />
                  {t("cap.suggestBuild.action")}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-4">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h3 className="font-display text-base font-semibold">{t("cap.records.title")}</h3>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("cap.records.add")}
          </Button>
        </div>
        <ul className="divide-y divide-border/40">
          {activities.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              {t("cap.records.empty")}
            </li>
          )}
          {activities.map((a) => {
            const joined = participants
              .filter((p) => p.activity_id === a.id)
              .map((p) => peopleById.get(p.person_id)?.name)
              .filter(Boolean);
            return (
              <li key={a.id} className="space-y-1.5 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand">
                    {t(`cap.activityKind.${a.kind}`)}
                  </span>
                  <span className="font-medium">{a.title}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{a.happened_on}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => {
                        setEditing(a);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <ConfirmAction
                      title={t("cap.records.deleteTitle")}
                      description={t("cap.records.deleteDesc")}
                      confirmLabel={t("cap.records.deleteConfirm")}
                      onConfirm={() => remove.mutate(a.id)}
                    >
                      <Button size="icon" variant="ghost" className="size-8 text-danger">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </ConfirmAction>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {a.host && <span>{t("cap.records.hostPrefix")} {a.host}</span>}
                  {a.duration_minutes && <span>{a.duration_minutes} {t("cap.unit.minutes")}</span>}
                  {joined.length > 0 && <span>{t("cap.records.joinedPrefix")} {joined.length} {t("cap.records.joinedMid")}{joined.join("、")}</span>}
                  {(a.capability_tags ?? []).length > 0 && (
                    <span className="text-ok">{t("cap.records.capabilitiesPrefix")}{a.capability_tags.join("、")}</span>
                  )}
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noreferrer" className="text-brand underline">
                      {t("cap.records.notes")}
                    </a>
                  )}
                </div>
                {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <ActivityDialog
        open={open}
        onOpenChange={setOpen}
        activity={editing}
        directions={data.directions}
        people={data.people}
        participantIds={
          editing
            ? participants.filter((p) => p.activity_id === editing.id).map((p) => p.person_id)
            : []
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums">
        <span className={tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : ""}>{value}</span>
        <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}

function Num({ n, tone }: { n: number; tone: "brand" | "danger" | "warn" | "ok" | "muted" }) {
  const cls =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : tone === "ok"
          ? "text-ok"
          : tone === "muted"
            ? "text-muted-foreground"
            : "brand-gradient-text";
  return <span className={`font-bold tabular-nums ${cls}`}>{n}</span>;
}

function Bar({ value, total, className }: { value: number; total: number; className: string }) {
  if (!total || !value) return null;
  return <div className={className} style={{ width: `${(value / total) * 100}%` }} />;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/* ----------------------------------- 趋势 ---------------------------------- */

function TrendPanel({ data, activities }: { data: Workspace; activities: Activity[] }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: snaps } = useQuery({ queryKey: ["snapshots"], queryFn: fetchSnapshots });

  const caps = useMemo(() => buildCapabilities(data.roles, data.people), [data]);
  const health = capabilityHealth(caps);
  const onboard = data.people.filter((p) => p.status === "onboard").length;
  const targetSeats = data.roles.reduce((n, r) => n + r.target_count, 0);
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const acts90 = activities.filter((a) => a.happened_on >= since).length;

  const save = useMutation({
    mutationFn: () =>
      recordSnapshot({
        scope_node_id: null,
        total_caps: health.total,
        covered_caps: health.covered,
        blank_caps: health.blank,
        single_caps: health.single,
        coverage_rate: health.coverageRate,
        onboard_people: onboard,
        target_seats: targetSeats,
        activities_90d: acts90,
      }),
    onSuccess: () => {
      toast.success(t("cap.trend.saveToast"));
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = snaps ?? [];
  const first = list[0];
  const last = list[list.length - 1];

  return (
    <div className="space-y-6">
      <HeadcountFlow />

      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold">{t("cap.trend.title")}</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t("cap.trend.desc")}
            </p>
          </div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Plus className="size-4" /> {t("cap.trend.save")}
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <TrendTile label={t("cap.trend.coverageRate")} value={`${health.coverageRate}%`} delta={first ? health.coverageRate - first.coverage_rate : null} unit="%" />
          <TrendTile label={t("cap.trend.onboard")} value={String(onboard)} delta={first ? onboard - first.onboard_people : null} />
          <TrendTile label={t("cap.trend.blank")} value={String(health.blank)} delta={first ? health.blank - first.blank_caps : null} invert />
          <TrendTile label={t("cap.trend.activities90d")} value={String(acts90)} delta={first ? acts90 - first.activities_90d : null} />
        </div>
      </section>

      {list.length >= 2 ? (
        <section className="panel p-6">
          <h3 className="font-display text-base font-semibold">{t("cap.trend.curveTitle")}</h3>
          <Sparkline snaps={list} />
          <p className="mt-2 text-xs text-muted-foreground">
            {first?.taken_on} → {last?.taken_on}{t("cap.trend.periodMid")}{list.length} {t("cap.trend.periodSuffix")}
          </p>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("cap.trend.needTwo")}
        </p>
      )}

      {list.length > 0 && (
        <section className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-normal">{t("cap.table.date")}</th>
                <th className="px-4 py-2.5 font-normal">{t("cap.table.coverageRate")}</th>
                <th className="px-4 py-2.5 font-normal">{t("cap.table.blank")}</th>
                <th className="px-4 py-2.5 font-normal">{t("cap.table.single")}</th>
                <th className="px-4 py-2.5 font-normal">{t("cap.table.onboardVsTarget")}</th>
                <th className="px-4 py-2.5 font-normal">{t("cap.table.activities90d")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {[...list].reverse().map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 tabular-nums">{s.taken_on}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.coverage_rate}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.blank_caps}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.single_caps}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {s.onboard_people} / {s.target_seats}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{s.activities_90d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function TrendTile({
  label,
  value,
  delta,
  unit = "",
  invert = false,
}: {
  label: string;
  value: string;
  delta: number | null;
  unit?: string;
  invert?: boolean;
}) {
  const { t } = useI18n();
  const good = delta == null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="rounded-lg border border-border/70 bg-surface-raised/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
      {delta != null && delta !== 0 && (
        <p className={`mt-0.5 text-xs tabular-nums ${good ? "text-ok" : "text-warn"}`}>
          {delta > 0 ? "+" : ""}
          {delta}
          {unit} {t("cap.trend.sinceFirst")}
        </p>
      )}
    </div>
  );
}

function Sparkline({ snaps }: { snaps: Snapshot[] }) {
  const { t } = useI18n();
  const w = 600;
  const h = 120;
  const pts = snaps.map((s, i) => {
    const x = (i / Math.max(1, snaps.length - 1)) * (w - 20) + 10;
    const y = h - 10 - (s.coverage_rate / 100) * (h - 20);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" role="img" aria-label={t("cap.trend.curveAriaLabel")}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => {
        const [x, y] = p.split(",");
        return <circle key={i} cx={x} cy={y} r="3" fill="var(--color-brand)" />;
      })}
    </svg>
  );
}

/* -------------------------------- 人员流动 -------------------------------- */

function HeadcountFlow() {
  const { t } = useI18n();
  const { data: events } = useQuery({ queryKey: ["lifecycle"], queryFn: fetchLifecycleEvents });
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const list = events ?? [];
  const stats = useMemo(() => flowStats(list), [list]);
  const nameOf = (id: string) => ws?.people.find((p) => p.id === id)?.name ?? "—";
  const max = Math.max(1, ...stats.byMonth.map((m) => Math.max(m.joins, m.exits)));

  return (
    <section className="panel p-6">
      <h3 className="font-display text-base font-semibold">{t("lc.flow.title")}</h3>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {t("lc.flow.desc")}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <TrendTile label={t("lc.flow.joins90")} value={String(stats.joins90)} delta={null} />
        <TrendTile label={t("lc.flow.exits90")} value={String(stats.exits90)} delta={null} />
        <TrendTile
          label={t("lc.flow.net90")}
          value={`${stats.net90 > 0 ? "+" : ""}${stats.net90}`}
          delta={null}
        />
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {t("lc.flow.byMonth")}
        </p>
        <div className="mt-3 flex items-end gap-4">
          {stats.byMonth.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-1">
                <div
                  className="w-3 rounded-t bg-ok"
                  style={{ height: `${(m.joins / max) * 100}%` }}
                  title={`${t("lc.flow.joins")} ${m.joins}`}
                />
                <div
                  className="w-3 rounded-t bg-danger"
                  style={{ height: `${(m.exits / max) * 100}%` }}
                  title={`${t("lc.flow.exits")} ${m.exits}`}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {m.month.slice(5)}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                +{m.joins} / -{m.exits}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <Legend className="bg-ok" label={t("lc.flow.joins")} />
          <Legend className="bg-danger" label={t("lc.flow.exits")} />
        </div>
      </div>

      {stats.exitReasons.length > 0 && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t("lc.flow.reasons")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.exitReasons.map((r) => (
              <span
                key={r.reason}
                className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {t(`lc.reason.${r.reason}`)} · {r.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {t("lc.flow.recent")}
        </p>
        {list.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("lc.flow.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/40">
            {list.slice(0, 8).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2.5 py-2 text-sm">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    e.event_type === "exit" ? "bg-danger/12 text-danger" : "bg-ok/12 text-ok"
                  }`}
                >
                  {e.event_type === "exit" ? t("lc.flow.eventExit") : t("lc.flow.eventJoin")}
                </span>
                <span className="font-medium">{nameOf(e.person_id)}</span>
                <span className="text-xs text-muted-foreground">
                  {e.effective_on} · {t(`lc.reason.${e.reason ?? "other"}`)}
                  {e.detail ? ` · ${e.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

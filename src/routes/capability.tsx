import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, Info, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ActivityDialog } from "@/components/ActivityDialog";
import { ConfirmAction } from "@/components/ConfirmAction";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorkspace, criticalityLabel } from "@/lib/talent";
import {
  buildCapabilities,
  capabilityHealth,
  kindLabel,
  vacancyClusters,
  type Capability,
} from "@/lib/capability";
import {
  activitiesForCapability,
  activityKindLabel,
  buildingStats,
  fetchOrgBuilding,
  type Activity,
  type Participant,
} from "@/lib/org-building";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchOrgNodes, peopleInSubtree } from "@/lib/org-tree";
import { fetchSnapshots, recordSnapshot, type Snapshot } from "@/lib/snapshots";

export const Route = createFileRoute("/capability")({
  validateSearch: (search: Record<string, unknown>) => ({
    scope: typeof search.scope === "string" ? search.scope : undefined,
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
  return (
    <AppShell
      title="组织能力视图"
      subtitle="两件事：我们的岗位要求的能力有没有人扛得起来，以及我们为建设这支队伍做了什么。"
    >
      <CapabilityBody />
    </AppShell>
  );
}

function CapabilityBody() {
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: building } = useQuery({ queryKey: ["org-building"], queryFn: fetchOrgBuilding });
  const { data: nodes } = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const { scope: scopeParam } = useSearch({ from: "/capability" });
  const scope = scopeParam ?? "__all__";

  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

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
  const scopeName = allNodes.find((n) => n.id === scope)?.name ?? "全组织";

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
    <Tabs defaultValue="health" className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="health">能力体检</TabsTrigger>
          <TabsTrigger value="building">组织建设</TabsTrigger>
          <TabsTrigger value="trend">趋势</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            当前范围：<b className="text-foreground">{scopeName}</b>
          </span>
          {scope === "__all__" ? (
            <Link to="/org" className="text-brand hover:underline">
              按团队查看 →
            </Link>
          ) : (
            <>
              <span>（仅统计该节点及下级团队在岗人员所承担的岗位）</span>
              <Link to="/capability" search={{ scope: undefined }} className="text-brand hover:underline">
                回到全组织
              </Link>
            </>
          )}
        </div>
      </div>
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

/* ---------------------------------- 能力体检 --------------------------------- */

type Workspace = NonNullable<Awaited<ReturnType<typeof fetchWorkspace>>>;

function HealthPanel({ data, activities }: { data: Workspace; activities: Activity[] }) {
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
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">体检结论</p>
        <p className="mt-3 max-w-3xl font-display text-xl leading-relaxed md:text-2xl">
          {active?.title ?? "本方向"}的岗位共要求 <Num n={health.total} tone="brand" /> 项能力。其中{" "}
          <Num n={health.vacancyDriven} tone="muted" /> 项是
          <strong className="text-foreground">岗位还没招到人</strong>造成的（招到人就解决）；真正需要
          现有团队补的是 <Num n={gaps.length + singles.length + thins.length} tone="warn" /> 项；已经
          站稳 <Num n={covered.length} tone="ok" /> 项。
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
          <Legend className="bg-muted-foreground/50" label={`等招聘 ${health.vacancyDriven}`} />
          <Legend className="bg-danger" label={`人在能力不在 ${gaps.length}`} />
          <Legend className="bg-warn" label={`人手不足 ${singles.length + thins.length}`} />
          <Legend className="bg-ok" label={`已覆盖 ${covered.length}`} />
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
                  {list.length} 项能力 · {risky} 项要现有团队补
                </span>
              </button>
            );
          })}
        </div>

        {/* 根因一：岗位空缺 */}
        {clusters.length > 0 && (
          <div className="panel overflow-hidden">
            <div className="border-b border-border/50 px-5 py-4">
              <h3 className="font-display text-base font-semibold">因为岗位还没到岗</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                这些能力目前挂在空缺岗位上，是同一个原因造成的，不必逐条焦虑——推进招聘即可。
              </p>
            </div>
            <ul className="divide-y divide-border/40">
              {clusters.map((c) => (
                <VacancyRow key={c.role.id} title={c.role.title} crit={c.role.criticality} caps={c.caps} />
              ))}
            </ul>
          </div>
        )}

        {/* 根因二：人在但能力不在 */}
        <Group
          title="人在，但这项能力没人扛"
          desc="岗位上有人，却没有人被评估具备这项能力——这是培养或引进要解决的"
          tone="text-danger"
          list={gaps}
          activities={activities}
        />
        <Group
          title="只靠 1 人"
          desc="他一走，这项能力就断了"
          tone="text-warn"
          list={singles}
          activities={activities}
        />
        <Group
          title="人手偏少"
          desc="有人承载，但少于岗位编制需求"
          tone="text-warn"
          list={thins}
          activities={activities}
        />
        <Collapsed title={`已覆盖 ${covered.length} 项`} list={covered} activities={activities} />

        {dirCaps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            这个方向的岗位还没有填写画像信息，先去「战略岗位视图」补齐或用 AI 生成。
          </p>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        能力项由岗位画像自动汇总（近义写法已合并），承载人来自任岗关系；「近期有建设」来自组织建设里
        记录的技术分享 / 培训 / 复盘 / 跨团队交流。岗位画像一改，这里就跟着变。
      </p>
    </div>
  );
}

function VacancyRow({
  title,
  crit,
  caps,
}: {
  title: string;
  crit: string;
  caps: Capability[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
      >
        <UserPlus className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">岗位「{title}」尚未到岗</span>
        <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {criticalityLabel[crit] ?? crit}
        </span>
        <span className="text-xs text-muted-foreground">影响 {caps.length} 项能力</span>
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
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
  const [showAll, setShowAll] = useState(false);
  if (!list.length) return null;
  const visible = showAll ? list : list.slice(0, 6);
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 px-5 py-4">
        <span className={`size-2 rounded-full ${tone.replace("text-", "bg-")}`} />
        <h3 className={`font-display text-base font-semibold ${tone}`}>{title}</h3>
        <span className="font-display text-sm tabular-nums text-muted-foreground">
          {list.length} 项
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
          {showAll ? "收起" : `展开其余 ${list.length - 6} 项（重要度较低）`}
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
  const built = activitiesForCapability(activities, cap.label);
  return (
    <li className="space-y-1.5 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{cap.label}</span>
        <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {kindLabel[cap.kind]}
        </span>
        {cap.aliases.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            已合并：{cap.aliases.join("、")}
          </span>
        )}
        {built.length > 0 && (
          <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] text-ok">
            近期有建设 · {built.length} 次
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {cap.carriers.length
            ? cap.carriers.map((c) => c.person.name).join("、")
            : "暂无人选"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>来自 {cap.roleTitles.join(" / ")}</span>
        <span className="text-brand">下一步：{cap.suggestion}</span>
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
      toast.success("已删除活动记录");
      qc.invalidateQueries({ queryKey: ["org-building"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const peopleById = new Map(data.people.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="近 90 天活动" value={stats.recentCount} unit="场" />
        <Tile label="参与覆盖率" value={stats.participationRate} unit="%" />
        <Tile label="人均参与" value={stats.perPersonAvg} unit="次" />
        <Tile label="90 天未参与" value={stats.dormant.length} unit="人" tone={stats.dormant.length ? "warn" : "ok"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h3 className="font-display text-base font-semibold">活动结构</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            氛围类（团建）和能力类（分享 / 培训）都需要，只有一种说明组织建设是偏的。
          </p>
          <div className="mt-4 space-y-2">
            {stats.byKind.length === 0 && (
              <p className="text-sm text-muted-foreground">近 90 天还没有活动记录。</p>
            )}
            {stats.byKind.map((k) => (
              <div key={k.kind} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{k.label}</span>
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
            <h3 className="font-display text-base font-semibold">氛围信号</h3>
            <p className="mt-1 text-xs text-muted-foreground">谁在参与，谁被落下了。</p>
          </div>
          <div className="space-y-1 text-sm">
            {stats.topPeople.map(({ person, count }) => (
              <div key={person.id} className="flex justify-between">
                <span>{person.name}</span>
                <span className="tabular-nums text-muted-foreground">{count} 次</span>
              </div>
            ))}
            {stats.topPeople.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无参与记录。</p>
            )}
          </div>
          {stats.dormant.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
              <p className="font-medium text-warn">90 天内没参加过任何活动</p>
              <p className="mt-1 text-muted-foreground">
                {stats.dormant.map((p) => p.name).join("、")}
              </p>
            </div>
          )}
        </div>
      </section>

      {singleRisk.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-display text-base font-semibold">建议安排的建设动作</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            以下能力目前只靠 1 个人，安排一次内部分享是成本最低的扩散方式。
          </p>
          <div className="mt-4 space-y-2">
            {singleRisk.map((c) => (
              <div
                key={c.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 px-4 py-2.5 text-sm"
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground">
                  仅 {c.carriers.map((x) => x.person.name).join("、")} 承载
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
                  安排分享
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-4">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h3 className="font-display text-base font-semibold">活动记录</h3>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            记录活动
          </Button>
        </div>
        <ul className="divide-y divide-border/40">
          {activities.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              还没有记录。把团建、技术分享、例会、培训记下来，组织建设才看得见。
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
                    {activityKindLabel[a.kind] ?? a.kind}
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
                      title="删除这条活动记录？"
                      description="删除后，这场活动的参与人记录也会一并移除，且无法恢复。"
                      confirmLabel="确认删除"
                      onConfirm={() => remove.mutate(a.id)}
                    >
                      <Button size="icon" variant="ghost" className="size-8 text-danger">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </ConfirmAction>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {a.host && <span>组织者 {a.host}</span>}
                  {a.duration_minutes && <span>{a.duration_minutes} 分钟</span>}
                  {joined.length > 0 && <span>参与 {joined.length} 人：{joined.join("、")}</span>}
                  {(a.capability_tags ?? []).length > 0 && (
                    <span className="text-ok">能力：{a.capability_tags.join("、")}</span>
                  )}
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noreferrer" className="text-brand underline">
                      纪要
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
      toast.success("已记录本期快照");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = snaps ?? [];
  const first = list[0];
  const last = list[list.length - 1];

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold">组织能力趋势</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              系统里的数据都是「当前快照」。每周（或每次盘点后）记一次，就能看到覆盖率、在岗人数与建设
              活动的变化曲线。
            </p>
          </div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Plus className="size-4" /> 记录本期快照
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <TrendTile label="能力覆盖率" value={`${health.coverageRate}%`} delta={first ? health.coverageRate - first.coverage_rate : null} unit="%" />
          <TrendTile label="在岗人数" value={String(onboard)} delta={first ? onboard - first.onboard_people : null} />
          <TrendTile label="无人承载" value={String(health.blank)} delta={first ? health.blank - first.blank_caps : null} invert />
          <TrendTile label="90 天活动" value={String(acts90)} delta={first ? acts90 - first.activities_90d : null} />
        </div>
      </section>

      {list.length >= 2 ? (
        <section className="panel p-6">
          <h3 className="font-display text-base font-semibold">覆盖率曲线</h3>
          <Sparkline snaps={list} />
          <p className="mt-2 text-xs text-muted-foreground">
            {first?.taken_on} → {last?.taken_on}，共 {list.length} 期
          </p>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          至少记录 2 期快照后，这里会显示趋势曲线。
        </p>
      )}

      {list.length > 0 && (
        <section className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-normal">日期</th>
                <th className="px-4 py-2.5 font-normal">覆盖率</th>
                <th className="px-4 py-2.5 font-normal">无人承载</th>
                <th className="px-4 py-2.5 font-normal">只靠 1 人</th>
                <th className="px-4 py-2.5 font-normal">在岗 / 编制</th>
                <th className="px-4 py-2.5 font-normal">90 天活动</th>
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
  const good = delta == null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="rounded-lg border border-border/70 bg-surface-raised/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
      {delta != null && delta !== 0 && (
        <p className={`mt-0.5 text-xs tabular-nums ${good ? "text-ok" : "text-warn"}`}>
          {delta > 0 ? "+" : ""}
          {delta}
          {unit} 自首期
        </p>
      )}
    </div>
  );
}

function Sparkline({ snaps }: { snaps: Snapshot[] }) {
  const w = 600;
  const h = 120;
  const pts = snaps.map((s, i) => {
    const x = (i / Math.max(1, snaps.length - 1)) * (w - 20) + 10;
    const y = h - 10 - (s.coverage_rate / 100) * (h - 20);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" role="img" aria-label="能力覆盖率趋势">
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

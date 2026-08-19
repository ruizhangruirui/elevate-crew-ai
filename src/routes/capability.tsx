import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Layers, ShieldAlert, Sparkles, UserX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { fetchWorkspace } from "@/lib/talent";
import {
  buildCapabilities,
  capabilityHealth,
  directionStats,
  kindLabel,
  statusMeta,
  type Capability,
  type CapabilityKind,
} from "@/lib/capability";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/capability")({
  head: () => ({
    meta: [
      { title: "组织能力视图 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content:
          "从现有岗位画像自动推导组织能力地图，识别结构性空白、单点风险、能力断层与配置重叠。",
      },
      { property: "og:title", content: "组织能力视图 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content:
          "从现有岗位画像自动推导组织能力地图，识别结构性空白、单点风险、能力断层与配置重叠。",
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
      subtitle="不看单个人，而看组织能力：为实现战略方向所需的能力是否被岗位覆盖、是否有人承载、是否存在单点风险与配置重叠。"
    >
      <CapabilityBody />
    </AppShell>
  );
}

const KINDS: (CapabilityKind | "all")[] = ["all", "domain", "knowledge", "skill", "leadership"];

function CapabilityBody() {
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [kind, setKind] = useState<CapabilityKind | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "risk">("all");

  const caps = useMemo(
    () => (data ? buildCapabilities(data.roles, data.people) : []),
    [data],
  );
  const health = useMemo(() => capabilityHealth(caps), [caps]);
  const dirStats = useMemo(
    () => (data ? directionStats(data.directions, caps) : []),
    [data, caps],
  );

  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const { directions } = data;

  const visible = caps.filter(
    (c) =>
      (kind === "all" || c.kind === kind) &&
      (statusFilter === "all" || c.status === "blank" || c.status === "single" || c.depthGap),
  );

  const blanks = caps.filter((c) => c.status === "blank");
  const singles = caps.filter((c) => c.status === "single");
  const overlaps = caps.filter((c) => c.overlap);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-10">
        {/* Derivation notice */}
        <div className="flex items-start gap-3 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            本页所有能力项均由现有<strong className="text-foreground">岗位画像</strong>
            （专业领域 / 关键知识 / 技能 / 领导力）与人员任岗关系
            <strong className="text-foreground">自动推导</strong>
            ，不需要 HR 或业务部门额外维护任何数据。岗位画像更新后，本页即时同步。
          </p>
        </div>

        {/* Health tiles */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="能力项总数" value={health.total} />
          <StatTile
            label="覆盖率"
            value={`${health.coverageRate}%`}
            tone={health.coverageRate >= 70 ? "ok" : health.coverageRate >= 40 ? "warn" : "danger"}
          />
          <StatTile label="结构性空白" value={health.blank} tone={health.blank ? "danger" : "ok"} />
          <StatTile label="单点风险" value={health.single} tone={health.single ? "warn" : "ok"} />
          <StatTile label="跨方向共享能力" value={health.shared} />
        </section>

        {/* Risk panels */}
        <section className="grid gap-4 lg:grid-cols-3">
          <RiskPanel
            icon={UserX}
            tone="danger"
            title="结构性空白"
            desc="岗位要求，但当前无人承载"
            items={blanks.map((c) => ({ label: c.label, meta: c.roleTitles.join(" / ") }))}
          />
          <RiskPanel
            icon={ShieldAlert}
            tone="warn"
            title="单点风险 (Bus factor = 1)"
            desc="仅 1 人承载，离职即失守"
            items={singles.map((c) => ({
              label: c.label,
              meta: c.carriers.map((x) => x.person.name).join("、"),
            }))}
          />
          <RiskPanel
            icon={Layers}
            tone="muted"
            title="配置重叠"
            desc="3 个及以上岗位重复要求同一能力"
            items={overlaps.map((c) => ({
              label: c.label,
              meta: `${c.roleTitles.length} 个岗位`,
            }))}
          />
        </section>

        {/* Direction × capability heatmap */}
        <section className="panel p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">能力 × 方向 热力图</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                颜色表示承载状态：红 = 无人承载，橙 = 单点/偏薄，绿 = 已覆盖。格子内为承载人数。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    kind === k
                      ? "border-brand/60 bg-brand/15 text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "all" ? "全部" : kindLabel[k]}
                </button>
              ))}
              <button
                onClick={() => setStatusFilter(statusFilter === "all" ? "risk" : "all")}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  statusFilter === "risk"
                    ? "border-danger/60 bg-danger/15 text-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                只看风险项
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface-raised/80 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                    能力项
                  </th>
                  {directions.map((d) => (
                    <th
                      key={d.id}
                      className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground"
                    >
                      <span className="line-clamp-2 block max-w-[120px]">{d.title}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.key} className="group">
                    <td className="sticky left-0 z-10 border-t border-border/50 bg-surface-raised/80 px-3 py-2 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{c.label}</span>
                        <span className="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {kindLabel[c.kind]}
                        </span>
                        {c.requiredLevel && (
                          <span className="shrink-0 text-[10px] text-brand">{c.requiredLevel}</span>
                        )}
                        {c.depthGap && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="size-3.5 shrink-0 text-warn" />
                            </TooltipTrigger>
                            <TooltipContent>要求 Expert，但无人被评估到该等级（深度不足）</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {directions.map((d) => {
                      const inDir = c.directionIds.includes(d.id);
                      return (
                        <td key={d.id} className="border-t border-border/50 px-2 py-2 text-center">
                          {inDir ? <Cell cap={c} /> : <span className="text-muted/40">·</span>}
                        </td>
                      );
                    })}
                    <td className="border-t border-border/50 px-3 py-2 text-right">
                      <StatusBadge cap={c} />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={directions.length + 2}
                      className="px-3 py-10 text-center text-sm text-muted-foreground"
                    >
                      没有符合条件的能力项。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Direction rollup */}
        <section>
          <h2 className="font-display text-xl font-semibold">方向能力体检</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dirStats.map((s) => (
              <div key={s.direction.id} className="panel p-5">
                <p className="font-display text-base font-semibold">{s.direction.title}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tabular-nums">
                    {s.coverageRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">能力覆盖率</span>
                </div>
                <Progress value={s.coverageRate} className="mt-3 h-1.5" />
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{s.total} 项能力</Badge>
                  {s.blank > 0 && (
                    <Badge className="border-danger/40 bg-danger/15 text-danger" variant="outline">
                      {s.blank} 项空白
                    </Badge>
                  )}
                  {s.single > 0 && (
                    <Badge className="border-warn/40 bg-warn/15 text-warn" variant="outline">
                      {s.single} 项单点
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}

function Cell({ cap }: { cap: Capability }) {
  const n = cap.carriers.length;
  const cls =
    cap.status === "blank"
      ? "bg-danger/20 text-danger border-danger/30"
      : cap.status === "covered"
        ? "bg-ok/20 text-ok border-ok/30"
        : "bg-warn/20 text-warn border-warn/30";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-grid h-7 w-10 place-items-center rounded border text-xs font-semibold tabular-nums ${cls}`}
        >
          {n}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">{cap.label}</p>
        <p className="mt-1 text-xs">承载岗位：{cap.roleTitles.join(" / ")}</p>
        <p className="text-xs">
          承载人：{cap.carriers.length ? cap.carriers.map((c) => c.person.name).join("、") : "无"}
        </p>
        <p className="text-xs">岗位编制合计：{cap.targetSeats}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ cap }: { cap: Capability }) {
  const meta = statusMeta[cap.status];
  const cls =
    meta.tone === "danger"
      ? "border-danger/40 bg-danger/15 text-danger"
      : meta.tone === "warn"
        ? "border-warn/40 bg-warn/15 text-warn"
        : meta.tone === "ok"
          ? "border-ok/40 bg-ok/15 text-ok"
          : "border-border/70 text-muted-foreground";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
      <span
        className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${cls}`}
      >
        {meta.label}
      </span>
      </TooltipTrigger>
      <TooltipContent>{meta.hint}</TooltipContent>
    </Tooltip>
  );
}

function RiskPanel({
  icon: Icon,
  tone,
  title,
  desc,
  items,
}: {
  icon: typeof UserX;
  tone: "danger" | "warn" | "muted";
  title: string;
  desc: string;
  items: { label: string; meta: string }[];
}) {
  const toneCls =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted-foreground";
  return (
    <div className="panel flex flex-col p-5">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${toneCls}`} />
        <p className="font-display text-sm font-semibold">{title}</p>
        <span className={`ml-auto font-display text-lg font-bold tabular-nums ${toneCls}`}>
          {items.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <ul className="mt-3 space-y-2 overflow-y-auto pr-1 text-sm" style={{ maxHeight: 260 }}>
        {items.map((it) => (
          <li key={it.label} className="rounded-md border border-border/50 px-3 py-2">
            <p className="truncate font-medium">{it.label}</p>
            <p className="truncate text-xs text-muted-foreground">{it.meta || "—"}</p>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground">无</li>}
      </ul>
    </div>
  );
}
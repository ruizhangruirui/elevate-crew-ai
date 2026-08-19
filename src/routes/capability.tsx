import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { fetchWorkspace } from "@/lib/talent";
import {
  buildCapabilities,
  capabilityHealth,
  kindLabel,
  type Capability,
  type CapabilityStatus,
} from "@/lib/capability";

export const Route = createFileRoute("/capability")({
  head: () => ({
    meta: [
      { title: "组织能力视图 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "从现有岗位画像自动推导组织能力清单，看清哪些能力无人承载、哪些只靠一个人。",
      },
      { property: "og:title", content: "组织能力视图 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "从现有岗位画像自动推导组织能力清单，看清哪些能力无人承载、哪些只靠一个人。",
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
      subtitle="不看单个人，而看组织能力：我们的岗位一共要求了哪些能力，其中哪些真正有人扛得起来。"
    >
      <CapabilityBody />
    </AppShell>
  );
}

const GROUPS: { status: CapabilityStatus; title: string; desc: string; tone: string }[] = [
  {
    status: "blank",
    title: "无人承载",
    desc: "岗位画像里写了这项要求，但现在一个在岗的人都没有",
    tone: "danger",
  },
  {
    status: "single",
    title: "只靠 1 人",
    desc: "整个方向只有一个人扛这项能力，他一走就断了",
    tone: "warn",
  },
  {
    status: "thin",
    title: "人手偏少",
    desc: "有人承载，但少于岗位编制的需求",
    tone: "warn",
  },
  { status: "covered", title: "已覆盖", desc: "有足够的人承载这项能力", tone: "ok" },
];

function CapabilityBody() {
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [dirId, setDirId] = useState<string | null>(null);

  const caps = useMemo(() => (data ? buildCapabilities(data.roles, data.people) : []), [data]);

  useEffect(() => {
    if (data && !dirId && data.directions[0]) setDirId(data.directions[0].id);
  }, [data, dirId]);

  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const { directions } = data;
  const health = capabilityHealth(caps);
  const active = directions.find((d) => d.id === dirId) ?? directions[0] ?? null;
  const dirCaps = active ? caps.filter((c) => c.directionIds.includes(active.id)) : [];

  return (
    <div className="space-y-10">
      {/* Plain-language conclusion */}
      <section className="panel p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">体检结论</p>
        <p className="mt-3 max-w-3xl font-display text-xl leading-relaxed md:text-2xl">
          现有岗位一共要求 <Num n={health.total} tone="brand" /> 项能力，其中{" "}
          <Num n={health.blank} tone="danger" /> 项<strong className="text-danger">无人承载</strong>
          ，<Num n={health.single} tone="warn" /> 项<strong className="text-warn">只靠 1 个人</strong>
          ，真正站稳的只有 <Num n={health.covered} tone="ok" /> 项。
        </p>

        <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="flex h-full">
            <Bar value={health.blank} total={health.total} className="bg-danger" />
            <Bar value={health.single + health.thin} total={health.total} className="bg-warn" />
            <Bar value={health.covered} total={health.total} className="bg-ok" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <Legend className="bg-danger" label={`无人承载 ${health.blank}`} />
          <Legend className="bg-warn" label={`人手不足 ${health.single + health.thin}`} />
          <Legend className="bg-ok" label={`已覆盖 ${health.covered}`} />
        </div>
      </section>

      {/* Direction picker */}
      <section>
        <div className="flex flex-wrap gap-2">
          {directions.map((d) => {
            const list = caps.filter((c) => c.directionIds.includes(d.id));
            const risky = list.filter((c) => c.status === "blank" || c.status === "single").length;
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
                  {list.length} 项能力 · {risky} 项待补
                </span>
              </button>
            );
          })}
        </div>

        {/* Grouped capability list */}
        <div className="mt-6 space-y-6">
          {GROUPS.map((g) => {
            const list = dirCaps.filter((c) => c.status === g.status);
            if (!list.length) return null;
            const toneCls =
              g.tone === "danger"
                ? "text-danger"
                : g.tone === "warn"
                  ? "text-warn"
                  : "text-ok";
            return (
              <div key={g.status} className="panel overflow-hidden">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 px-5 py-4">
                  <span className={`size-2 rounded-full ${toneCls.replace("text-", "bg-")}`} />
                  <h3 className={`font-display text-base font-semibold ${toneCls}`}>{g.title}</h3>
                  <span className="font-display text-sm tabular-nums text-muted-foreground">
                    {list.length} 项
                  </span>
                  <p className="w-full text-xs text-muted-foreground sm:w-auto">{g.desc}</p>
                </div>
                <ul className="divide-y divide-border/40">
                  {list.map((c) => (
                    <CapRow key={c.key} cap={c} />
                  ))}
                </ul>
              </div>
            );
          })}
          {dirCaps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              这个方向的岗位还没有填写画像信息，先去「战略岗位视图」补齐或用 AI 生成。
            </p>
          )}
        </div>
      </section>

      {/* Footnote */}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        这些能力项不需要任何人额外维护——它们是从岗位画像里的专业领域 / 关键知识 / 技能 /
        领导力自动汇总的，承载人则来自人员的任岗关系。岗位画像一改，这里就跟着变。
      </p>
    </div>
  );
}

function CapRow({ cap }: { cap: Capability }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
      <span className="font-medium">{cap.label}</span>
      <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {kindLabel[cap.kind]}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        来自 {cap.roleTitles.join(" / ")}
      </span>
      <span className="w-full text-xs sm:w-44 sm:text-right">
        {cap.carriers.length ? (
          <span className="text-foreground">{cap.carriers.map((c) => c.person.name).join("、")}</span>
        ) : (
          <span className="text-danger">暂无人选</span>
        )}
      </span>
    </li>
  );
}

function Num({ n, tone }: { n: number; tone: "brand" | "danger" | "warn" | "ok" }) {
  const cls =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : tone === "ok"
          ? "text-ok"
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

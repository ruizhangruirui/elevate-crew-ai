import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Home,
} from "lucide-react";
import type { Person, Role } from "@/lib/talent";
import type { OrgNode } from "@/lib/org-tree";
import { useI18n } from "@/lib/i18n";
import { effectiveImportance } from "@/lib/importance";

type Props = {
  nodes: OrgNode[];
  people: Person[];
  roles: Role[];
  rolesByNode: Map<string, Role[]>;
  onPerson: (id: string) => void;
  onRole: (id: string) => void;
};

const DEFAULT_DEPTH = 2;

/**
 * 组织架构图：树只画到「团队」层，人员收敛为头像堆叠 + 摘要，
 * 支持折叠 / 聚焦 / 搜索 / 紧凑（横向缩进）模式，保证 200+ 人也不横向铺开。
 */
export function OrgChart({ nodes, people, roles, rolesByNode, onPerson, onRole }: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [query, setQuery] = useState("");
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const childrenOf = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const n of nodes) {
      const key = n.parent_id ?? "__root";
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [nodes]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const peopleOf = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of people) {
      if (!p.org_node_id) continue;
      map.set(p.org_node_id, [...(map.get(p.org_node_id) ?? []), p]);
    }
    return map;
  }, [people]);

  const subtreePeople = useMemo(() => {
    const map = new Map<string, Person[]>();
    const walk = (id: string): Person[] => {
      const own = peopleOf.get(id) ?? [];
      const kids = (childrenOf.get(id) ?? []).flatMap((c) => walk(c.id));
      const all = [...own, ...kids];
      map.set(id, all);
      return all;
    };
    for (const r of childrenOf.get("__root") ?? []) walk(r.id);
    return map;
  }, [childrenOf, peopleOf]);

  const path = useMemo(() => {
    const out: OrgNode[] = [];
    let cur = focusId ? (byId.get(focusId) ?? null) : null;
    while (cur) {
      out.unshift(cur);
      cur = cur.parent_id ? (byId.get(cur.parent_id) ?? null) : null;
    }
    return out;
  }, [focusId, byId]);

  // 搜索：展开命中路径，收起其它分支
  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = new Set<string>();
    for (const n of nodes) {
      const inNode =
        n.name.toLowerCase().includes(q) ||
        (peopleOf.get(n.id) ?? []).some((p) => p.name.toLowerCase().includes(q)) ||
        (rolesByNode.get(n.id) ?? []).some((r) => r.title.toLowerCase().includes(q));
      if (inNode) {
        let cur: OrgNode | null = n;
        while (cur) {
          hit.add(cur.id);
          cur = cur.parent_id ? (byId.get(cur.parent_id) ?? null) : null;
        }
      }
    }
    return hit;
  }, [query, nodes, peopleOf, rolesByNode, byId]);

  useEffect(() => {
    if (matchIds) setCollapsed({});
  }, [matchIds]);

  const roots = focusId
    ? [byId.get(focusId)].filter(Boolean as unknown as (n: OrgNode | undefined) => n is OrgNode)
    : (childrenOf.get("__root") ?? []);

  const isOpen = (id: string, depth: number) =>
    collapsed[id] === undefined ? depth + 1 < DEFAULT_DEPTH : !collapsed[id];

  const toggle = (id: string, depth: number) =>
    setCollapsed((s) => ({ ...s, [id]: isOpen(id, depth) }));

  /* ---------------------------- 团队卡片 ---------------------------- */

  const Card = ({ node, depth }: { node: OrgNode; depth: number }) => {
    const kids = (childrenOf.get(node.id) ?? []).filter((k) => !matchIds || matchIds.has(k.id));
    const members = subtreePeople.get(node.id) ?? [];
    const onboard = members.filter((p) => p.status === "onboard");
    const levels = onboard.map((p) => p.level).filter((l): l is number => l != null);
    const avg = levels.length
      ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10
      : null;
    const nodeRoles = rolesByNode.get(node.id) ?? [];
    const targetSeats = nodeRoles.reduce((n, r) => n + r.target_count, 0);
    const vacancies = nodeRoles.reduce((n, r) => {
      const filled = people.filter((p) => p.role_id === r.id && p.status === "onboard").length;
      return n + Math.max(0, r.target_count - filled);
    }, 0);
    const tiers = { core: 0, key: 0, support: 0, peripheral: 0 } as Record<string, number>;
    for (const p of onboard) tiers[effectiveImportance(p, roles)]++;
    const direct = peopleOf.get(node.id) ?? [];
    const Icon = node.type === "Team" ? Users : Building2;
    const open = isOpen(node.id, depth);
    const teamOpen = openTeam === node.id;

    return (
      <div
        className={`rounded-xl border bg-surface-raised/60 shadow-sm transition-colors ${
          matchIds?.has(node.id) && query ? "border-brand/60" : "border-border/60"
        } ${compact ? "w-full" : "w-56"}`}
      >
        <div className="flex items-start gap-2 px-3 py-2">
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(node.id, depth)}
              className="mt-0.5 text-muted-foreground hover:text-foreground"
              aria-label={open ? t("common.collapse") : t("common.expandAll")}
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          <Icon className="mt-0.5 size-3.5 shrink-0 text-brand" />
          <button
            type="button"
            onDoubleClick={() => setFocusId(node.id)}
            onClick={() => setOpenTeam(teamOpen ? null : node.id)}
            className="min-w-0 flex-1 text-left"
            title={t("chart.focusHint")}
          >
            <p className="truncate font-display text-xs font-semibold">{node.name}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {members.length} {t("common.people")} · {t("org.onboard")} {onboard.length}/
              {targetSeats || "—"} · L{avg ?? "—"}
              {vacancies > 0 ? (
                <span className="ml-1 text-warn">
                  · {vacancies} {t("common.vacantSeat")}
                </span>
              ) : null}
            </p>
          </button>
        </div>

        {/* 重要度构成色条 */}
        {onboard.length > 0 && (
          <div className="mx-3 flex h-1 overflow-hidden rounded-full bg-border/50">
            {(["core", "key", "support", "peripheral"] as const).map((k) =>
              tiers[k] ? (
                <span
                  key={k}
                  className={
                    k === "core"
                      ? "bg-brand"
                      : k === "key"
                        ? "bg-ok"
                        : k === "support"
                          ? "bg-muted-foreground/50"
                          : "bg-border"
                  }
                  style={{ width: `${(tiers[k] / onboard.length) * 100}%` }}
                />
              ) : null,
            )}
          </div>
        )}

        {/* 岗位徽标 */}
        {nodeRoles.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pt-2">
            {nodeRoles.slice(0, 4).map((r) => {
              const filled = people.filter(
                (p) => p.role_id === r.id && p.status === "onboard",
              ).length;
              const gap = Math.max(0, r.target_count - filled);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRole(r.id)}
                  className={`max-w-full truncate rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
                    gap > 0
                      ? "bg-warn/12 text-warn hover:bg-warn/20"
                      : "bg-ok/12 text-ok hover:bg-ok/20"
                  }`}
                >
                  <Briefcase className="mr-1 inline size-2.5" />
                  {r.title} {filled}/{r.target_count}
                </button>
              );
            })}
            {nodeRoles.length > 4 && (
              <span className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground">
                +{nodeRoles.length - 4}
              </span>
            )}
          </div>
        )}

        {/* 人员头像堆叠 */}
        {direct.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenTeam(teamOpen ? null : node.id)}
            className="mt-2 flex w-full items-center gap-1 rounded-b-xl border-t border-border/40 px-3 py-1.5 text-left transition-colors hover:bg-background/40"
          >
            {direct.slice(0, 6).map((p) => (
              <span
                key={p.id}
                className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 text-[9px] font-semibold text-brand"
              >
                {p.name.slice(0, 1)}
              </span>
            ))}
            {direct.length > 6 && (
              <span className="text-[10px] text-muted-foreground">+{direct.length - 6}</span>
            )}
            <ChevronRight
              className={`ml-auto size-3 text-muted-foreground transition-transform ${teamOpen ? "rotate-90" : ""}`}
            />
          </button>
        )}

        {/* 展开的人员列表 */}
        {teamOpen && direct.length > 0 && (
          <div className="max-h-56 space-y-1 overflow-y-auto border-t border-border/40 px-2 py-2">
            {direct.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPerson(p.id)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-background/60"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 text-[9px] font-semibold text-brand">
                  {p.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]">{p.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {p.level ? `L${p.level}` : "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ---------------------------- 两种布局 ---------------------------- */

  const renderTree = (node: OrgNode, depth: number) => {
    const kids = (childrenOf.get(node.id) ?? []).filter((k) => !matchIds || matchIds.has(k.id));
    const open = isOpen(node.id, depth);
    return (
      <div className="flex flex-col items-center" key={node.id}>
        <Card node={node} depth={depth} />
        {open && kids.length > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-start">
              {kids.map((k) => (
                <Branch key={k.id}>{renderTree(k, depth + 1)}</Branch>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderCompact = (node: OrgNode, depth: number) => {
    const kids = (childrenOf.get(node.id) ?? []).filter((k) => !matchIds || matchIds.has(k.id));
    const open = isOpen(node.id, depth);
    return (
      <div key={node.id} style={{ paddingLeft: depth === 0 ? 0 : 16 }} className="space-y-2">
        <Card node={node} depth={depth} />
        {open && kids.length > 0 && (
          <div className="space-y-2 border-l border-border/60 pl-3">
            {kids.map((k) => renderCompact(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if ((childrenOf.get("__root") ?? []).length === 0) return null;

  return (
    <div className="space-y-3">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chart.search")}
            className="h-8 w-52 rounded-lg border border-border/60 bg-background/40 pl-7 pr-6 text-xs outline-none focus:border-brand/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 p-1">
          {([false, true] as const).map((c) => (
            <button
              key={String(c)}
              type="button"
              onClick={() => setCompact(c)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                compact === c
                  ? "bg-surface-raised font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c ? t("chart.compact") : t("chart.tree")}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(Object.fromEntries(nodes.map((n) => [n.id, false])))}
          className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("common.expandAll")}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(Object.fromEntries(nodes.map((n) => [n.id, true])))}
          className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("common.collapse")}
        </button>
      </div>

      {/* 面包屑 */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setFocusId(null)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Home className="size-3" /> {t("chart.wholeOrg")}
        </button>
        {path.map((n) => (
          <span key={n.id} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button
              type="button"
              onClick={() => setFocusId(n.id)}
              className="hover:text-foreground"
            >
              {n.name}
            </button>
          </span>
        ))}
        <span className="ml-auto text-[11px]">{t("chart.focusHint")}</span>
      </div>

      {compact ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background/20 p-4">
          {roots.map((r) => renderCompact(r, 0))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/20 p-4">
          <div className="flex min-w-max items-start justify-center gap-6">
            {roots.map((r) => renderTree(r, 0))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 单个子分支：顶部连接线 */
function Branch({ children }: { children: React.ReactNode }) {
  return (
    <div className="branch relative flex flex-col items-center px-2 pt-4">
      <span className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-border [.branch:first-child>&]:left-1/2 [.branch:last-child>&]:right-1/2" />
      <span className="pointer-events-none absolute top-0 left-1/2 h-4 w-px bg-border" />
      {children}
    </div>
  );
}

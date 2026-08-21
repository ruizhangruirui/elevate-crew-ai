import { Building2, Users, Briefcase, UserPlus } from "lucide-react";
import type { Person, Role } from "@/lib/talent";
import type { OrgNode } from "@/lib/org-tree";
import { useI18n } from "@/lib/i18n";
import { contractLabel } from "@/lib/contract";

type Props = {
  nodes: OrgNode[];
  people: Person[];
  roles: Role[];
  rolesByNode: Map<string, Role[]>;
  onPerson: (id: string) => void;
  onRole: (id: string) => void;
};

/** 上下结构的组织架构图：Lab → Team → 岗位（含空缺席位）→ 人 */
export function OrgChart({ nodes, people, roles, rolesByNode, onPerson, onRole }: Props) {
  const { t } = useI18n();
  const childrenOf = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    const key = n.parent_id ?? "__root";
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), n]);
  }
  const roots = childrenOf.get("__root") ?? [];

  const countIn = (id: string): number => {
    const own = people.filter((p) => p.org_node_id === id).length;
    return own + (childrenOf.get(id) ?? []).reduce((s, c) => s + countIn(c.id), 0);
  };

  const renderPerson = (p: Person) => (
    <Branch key={p.id}>
      <button
        type="button"
        onClick={() => onPerson(p.id)}
        className="flex w-36 flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 py-2 text-center transition-colors hover:border-brand/60 hover:bg-surface-raised/60"
      >
        <span className="grid size-7 place-items-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand">
          {p.name.slice(0, 1)}
        </span>
        <span className="w-full truncate text-xs font-medium">{p.name}</span>
        <span className="w-full truncate text-[10px] text-muted-foreground">
          {[p.level ? `L${p.level}` : null, contractLabel(t, p.contract_type), p.status !== "onboard" ? t("common.candidate") : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      </button>
    </Branch>
  );

  const renderRole = (r: Role, nodeId: string) => {
    const holders = people.filter((p) => p.role_id === r.id && p.org_node_id === nodeId);
    const onboardAll = people.filter((p) => p.role_id === r.id && p.status === "onboard").length;
    const vacancies = Math.max(0, r.target_count - onboardAll);
    const kids = [
      ...holders.map(renderPerson),
      ...Array.from({ length: vacancies }).map((_, i) => (
        <Branch key={`vac-${r.id}-${i}`}>
          <div className="flex w-36 flex-col items-center gap-1 rounded-lg border border-dashed border-warn/50 bg-warn/5 px-2 py-2 text-center text-warn">
            <UserPlus className="size-5" />
            <span className="text-xs font-medium">{t("common.vacantSeat")}</span>
            <span className="text-[10px] opacity-80">
              L{r.level_min}–{r.level_max}
            </span>
          </div>
        </Branch>
      )),
    ];

    return (
      <Branch key={r.id}>
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => onRole(r.id)}
            className="w-44 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-center transition-colors hover:border-brand/60 hover:bg-surface-raised/60"
          >
            <Briefcase className="mx-auto size-4 text-brand" />
            <p className="mt-1 truncate text-xs font-semibold">{r.title}</p>
            <p
              className={`mt-0.5 text-[10px] tabular-nums ${vacancies > 0 ? "text-warn" : "text-ok"}`}
            >
              {t("org.onboard")} {onboardAll} / {t("org.target")} {r.target_count}
            </p>
          </button>
          <Children>{kids}</Children>
        </div>
      </Branch>
    );
  };

  const renderNode = (node: OrgNode) => {
    const subs = childrenOf.get(node.id) ?? [];
    const members = people.filter((p) => p.org_node_id === node.id);
    const nodeRoles = rolesByNode.get(node.id) ?? [];
    const roleless = members.filter(
      (p) => !p.role_id || !nodeRoles.some((r) => r.id === p.role_id),
    );
    const Icon = node.type === "Team" ? Users : Building2;

    const kids = [
      ...subs.map((s) => <Branch key={s.id}>{renderNode(s)}</Branch>),
      ...nodeRoles.map((r) => renderRole(r, node.id)),
      ...roleless.map(renderPerson),
    ];

    return (
      <div className="flex flex-col items-center" key={node.id}>
        <div className="w-52 rounded-xl border border-border/60 bg-surface-raised/60 px-3 py-2.5 text-center shadow-sm">
          <Icon className="mx-auto size-4 text-brand" />
          <p className="mt-1 truncate font-display text-sm font-semibold">{node.name}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {node.type} · {countIn(node.id)} {t("common.people")}
          </p>
        </div>
        <Children>{kids}</Children>
      </div>
    );
  };

  if (roots.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/20 p-6">
      <div className="flex min-w-max items-start justify-center gap-10">
        {roots.map((r) => renderNode(r))}
      </div>
    </div>
  );
}

/** 子节点容器：画竖线 + 横线连接 */
function Children({ children }: { children: React.ReactNode[] }) {
  const items = children.filter(Boolean);
  if (items.length === 0) return null;
  return (
    <>
      <div className="h-6 w-px bg-border" />
      <div className="flex items-start">{items}</div>
    </>
  );
}

/** 单个子分支：顶部连接线 */
function Branch({ children }: { children: React.ReactNode }) {
  return (
    <div className="branch relative flex flex-col items-center px-3 pt-6">
      <span className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-border [.branch:first-child>&]:left-1/2 [.branch:last-child>&]:right-1/2" />
      <span className="pointer-events-none absolute top-0 left-1/2 h-6 w-px bg-border" />
      {children}
    </div>
  );
}

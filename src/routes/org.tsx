import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight,
  Building2,
  Users,
  UserRound,
  FolderTree,
  Sparkles,
  ArrowUpRight,
  Briefcase,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { PersonDetailSheet } from "@/components/PersonDetailSheet";
import { RoleDetailSheet } from "@/components/RoleDetailSheet";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWorkspace, criticalityLabel, type Person, type Role } from "@/lib/talent";
import { fetchOrgNodes, structureStats, type OrgNode } from "@/lib/org-tree";
import { TeamDiagnosisDialog } from "@/components/TeamDiagnosisDialog";
import { OrgChart } from "@/components/OrgChart";
import { useI18n } from "@/lib/i18n";
import { contractLabel } from "@/lib/contract";
import { effectiveImportance, IMPORTANCE_TONE, type Importance } from "@/lib/importance";

export const Route = createFileRoute("/org")({
  head: () => ({
    meta: [
      { title: "组织视图 — 战略岗位与人才" },
      {
        name: "description",
        content: "从 Lab 到 Team 到人，逐层展开组织结构，点开成员查看岗位、技能与能力承载详情。",
      },
      { property: "og:title", content: "组织视图 — 战略岗位与人才" },
      {
        property: "og:description",
        content: "从 Lab 到 Team 到人，逐层展开组织结构，点开成员查看详情。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrgPage,
});


function OrgPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t("org.title")} subtitle={t("org.subtitle")}>
      <OrgTreeBody />
    </AppShell>
  );
}

function ImportanceChip({ level, leader }: { level: Importance; leader?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${IMPORTANCE_TONE[level]}`}>
      {t(`importance.${level}`)}
      {leader ? ` · ${t("importance.leaderBadge")}` : ""}
    </span>
  );
}

function PersonRow({
  person,
  roles,
  onOpen,
  muted,
}: {
  person: Person;
  roles: Role[];
  onOpen: () => void;
  muted?: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-brand/50 hover:bg-surface-raised/60 ${
        muted ? "border-dashed border-border/60 bg-background/20" : "border-border/50 bg-background/40"
      }`}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand">
        {person.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {person.name}
          {person.level ? (
            <span className="ml-2 text-xs text-muted-foreground">L{person.level}</span>
          ) : null}
        </p>
        {(person.contract_type || (person.tags ?? []).length > 0 || muted) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {[
              muted && ["core", "key"].includes(effectiveImportance(person, roles))
                ? t("org.noStrategicRole")
                : null,
              contractLabel(t, person.contract_type),
              ...(person.tags ?? []),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
      <ImportanceChip level={effectiveImportance(person, roles)} leader={!!person.is_leader} />
      {person.status !== "onboard" && (
        <span className="shrink-0 rounded-md bg-warn/12 px-1.5 py-0.5 text-[10px] text-warn">
          {t("common.candidate")}
        </span>
      )}
      <UserRound className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function OrgTreeBody() {
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const tree = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const [diagNode, setDiagNode] = useState<OrgNode | null>(null);
  const [view, setView] = useState<"chart" | "list">("chart");
  const { t } = useI18n();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);

  const nodes = useMemo(() => (tree.data ?? []).filter((n) => !n.archived), [tree.data]);
  const people = ws.data?.people ?? [];
  const roles = ws.data?.roles ?? [];
  const directions = ws.data?.directions ?? [];

  const childrenOf = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const n of nodes) {
      const key = n.parent_id ?? "__root";
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [nodes]);

  const peopleOf = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of people) {
      const key = p.org_node_id ?? "__none";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [people]);

  const countIn = (id: string): number => {
    const own = peopleOf.get(id)?.length ?? 0;
    return own + (childrenOf.get(id) ?? []).reduce((s, c) => s + countIn(c.id), 0);
  };

  const unassigned = peopleOf.get("__none") ?? [];

  /** 岗位归属团队：优先用 roles.org_node_id，未填写时按在岗人员所在团队推断 */
  const rolePlacement = useMemo(() => {
    const byNode = new Map<string, Role[]>();
    const unplaced: Role[] = [];
    for (const r of roles) {
      let nid = r.org_node_id ?? null;
      if (!nid) {
        const counts = new Map<string, number>();
        for (const p of people) {
          if (p.role_id === r.id && p.org_node_id)
            counts.set(p.org_node_id, (counts.get(p.org_node_id) ?? 0) + 1);
        }
        nid = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }
      if (nid) byNode.set(nid, [...(byNode.get(nid) ?? []), r]);
      else unplaced.push(r);
    }
    return { byNode, unplaced };
  }, [roles, people]);

  const placeRole = useMutation({
    mutationFn: async ({ rid, nodeId }: { rid: string; nodeId: string }) => {
      const { error } = await supabase.from("roles").update({ org_node_id: nodeId }).eq("id", rid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("org.roleAttached"));
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({ pid, nodeId }: { pid: string; nodeId: string | null }) => {
      const { error } = await supabase.from("people").update({ org_node_id: nodeId }).eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("org.personAssigned"));
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectableNodes = nodes.filter((n) => n.type !== "VNRC");

  const roots = childrenOf.get("__root") ?? [];

  const renderNode = (node: OrgNode, depth: number) => {
    const kids = childrenOf.get(node.id) ?? [];
    const members = peopleOf.get(node.id) ?? [];
    const nodeRoles = rolePlacement.byNode.get(node.id) ?? [];
    const roleless = members.filter((p) => !p.role_id || !nodeRoles.some((r) => r.id === p.role_id));
    const isOpen = expanded[node.id] ?? depth < 1;
    const total = countIn(node.id);
    const Icon = node.type === "Team" ? Users : Building2;
    const st = structureStats(node.id, nodes, people, roles, directions);

    return (
      <div key={node.id} className="rounded-xl border border-border/60 bg-surface-raised/40">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((s) => ({ ...s, [node.id]: !isOpen }))}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
          <Icon className="size-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold">{node.name}</p>
            {node.mission && (
              <p className="truncate text-xs text-muted-foreground">{node.mission}</p>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {node.type}
          </Badge>
          <span className="shrink-0 text-xs text-muted-foreground">{total} {t("common.people")}</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setDiagNode(node)}
          >
            <Sparkles className="size-3.5" /> {t("org.aiDiagnosis")}
          </Button>
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              {t("org.onboard")} <b className="text-foreground tabular-nums">{st.onboard}</b> / {t("org.target")}{" "}
              <b className="tabular-nums">{st.targetSeats}</b>
            </span>
            <span>
              {t("org.avgLevel")}{" "}
              <b className="text-foreground tabular-nums">{st.avgLevel ?? "—"}</b>
            </span>
            {st.directions.length > 0 && (
              <span className="truncate">
                {t("org.directions")}: {st.directions.map((d) => d.title).join(" / ")}
              </span>
            )}
            <Link
              to="/capability"
              search={{ scope: node.id }}
              className="ml-auto inline-flex items-center gap-1 text-brand hover:underline"
            >
              {t("org.viewCapability")} <ArrowUpRight className="size-3" />
            </Link>
          </div>
        )}

        {isOpen && (
          <div className="space-y-2 border-t border-border/50 px-3 py-3 pl-6">
            {kids.map((k) => renderNode(k, depth + 1))}

            {nodeRoles.map((r) => {
              const holders = members.filter((p) => p.role_id === r.id);
              const onboardAll = people.filter(
                (p) => p.role_id === r.id && p.status === "onboard",
              ).length;
              const vacancies = Math.max(0, r.target_count - onboardAll);
              const rk = `${node.id}:${r.id}`;
              const rOpen = expanded[rk] ?? true;
              return (
                <div key={r.id} className="rounded-lg border border-border/50 bg-background/30">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [rk]: !rOpen }))}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronRight
                        className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${rOpen ? "rotate-90" : ""}`}
                      />
                      <Briefcase className="size-3.5 shrink-0 text-brand" />
                      <span className="truncate text-sm font-medium">{r.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {criticalityLabel[r.criticality] ?? r.criticality}
                      </span>
                      <span
                        className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                          vacancies > 0 ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok"
                        }`}
                      >
                        {t("org.onboard")} {onboardAll} / {t("org.target")} {r.target_count}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs text-muted-foreground"
                      onClick={() => setRoleId(r.id)}
                    >
                      {t("org.roleProfile")}
                    </Button>
                  </div>

                  {rOpen && (
                    <div className="space-y-1.5 border-t border-border/40 px-3 py-2 pl-7">
                      {holders.map((p) => (
                        <PersonRow key={p.id} person={p} roles={roles} onOpen={() => setPersonId(p.id)} />
                      ))}
                      {Array.from({ length: vacancies }).map((_, i) => (
                        <div
                          key={`vac-${i}`}
                          className="flex items-center gap-3 rounded-lg border border-dashed border-warn/50 bg-warn/5 px-3 py-2 text-xs text-warn"
                        >
                          <UserPlus className="size-4 shrink-0" />
                          <span className="flex-1">{t("common.vacantSeat")} (L{r.level_min}–{r.level_max})</span>
                        </div>
                      ))}
                      {holders.length === 0 && vacancies === 0 && (
                        <p className="py-1 text-xs text-muted-foreground">{t("org.noSeats")}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {roleless.map((p) => (
              <PersonRow key={p.id} person={p} roles={roles} onOpen={() => setPersonId(p.id)} muted />
            ))}

            {kids.length === 0 && members.length === 0 && nodeRoles.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">{t("org.emptyNode")}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  if (ws.isLoading || tree.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={t("org.stat.nodes")} value={nodes.length} />
        <StatTile label={t("org.stat.assigned")} value={`${people.length - unassigned.length} / ${people.length}`} />
        <StatTile
          label={t("org.stat.unassigned")}
          value={unassigned.length}
          tone={unassigned.length > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border/60 p-1 w-fit">
        {(["chart", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              view === v ? "bg-surface-raised font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "chart" ? t("common.chartView") : t("common.listView")}
          </button>
        ))}
      </div>

      {roots.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-surface-raised/40 p-8 text-center">
          <FolderTree className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("org.emptyTree")}
          </p>
        </div>
      ) : view === "chart" ? (
        <OrgChart
          nodes={nodes}
          people={people}
          roles={roles}
          rolesByNode={rolePlacement.byNode}
          onPerson={setPersonId}
          onRole={setRoleId}
        />
      ) : (
        <div className="space-y-3">{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {rolePlacement.unplaced.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-surface-raised/40 p-4">
          <h2 className="font-display text-sm font-semibold">{t("org.unplacedRoles")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("org.unplacedRolesHint")}
          </p>
          <div className="mt-3 space-y-2">
            {rolePlacement.unplaced.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => setRoleId(r.id)}
                  className="min-w-0 flex-1 text-left text-sm font-medium hover:text-brand"
                >
                  {r.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("org.target")} {r.target_count}
                  </span>
                </button>
                <Select
                  onValueChange={(v) => placeRole.mutate({ rid: r.id, nodeId: v })}
                  disabled={placeRole.isPending}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder={t("org.attachToTeam")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableNodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}（{n.type}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </section>
      )}

      {unassigned.length > 0 && (
        <section className="rounded-xl border border-warn/40 bg-surface-raised/40 p-4">
          <h2 className="font-display text-sm font-semibold">{t("org.unassignedTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("org.unassignedHint")}
          </p>
          <div className="mt-3 space-y-2">
            {unassigned.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => setPersonId(p.id)}
                  className="min-w-0 flex-1 text-left text-sm font-medium hover:text-brand"
                >
                  {p.name}
                </button>
                <Select
                  onValueChange={(v) => assign.mutate({ pid: p.id, nodeId: v })}
                  disabled={assign.isPending}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder={t("org.selectTeam")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableNodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}（{n.type}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </section>
      )}

      {people.length > 0 && unassigned.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(Object.fromEntries(nodes.map((n) => [n.id, true])))}
          >
            {t("common.expandAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded({})}>
            {t("common.collapse")}
          </Button>
        </div>
      )}

      <TeamDiagnosisDialog
        key={diagNode?.id ?? "none"}
        nodeId={diagNode?.id ?? null}
        nodeName={diagNode?.name ?? ""}
        open={!!diagNode}
        onOpenChange={(v) => !v && setDiagNode(null)}
      />

      <PersonDetailSheet
        person={people.find((p) => p.id === personId) ?? null}
        people={people}
        roles={roles}
        directions={directions}
        open={!!personId}
        onOpenChange={(v) => !v && setPersonId(null)}
        onDone={() => qc.invalidateQueries({ refetchType: "all" })}
        onOpenRole={(rid) => {
          setPersonId(null);
          setRoleId(rid);
        }}
      />

      <RoleDetailSheet
        role={roles.find((r) => r.id === roleId) ?? null}
        people={people}
        directionTitle={
          directions.find((d) => d.id === roles.find((r) => r.id === roleId)?.direction_id)?.title ?? ""
        }
        open={!!roleId}
        onOpenChange={(v) => !v && setRoleId(null)}
        onDone={() => qc.invalidateQueries({ refetchType: "all" })}
      />
    </div>
  );
}


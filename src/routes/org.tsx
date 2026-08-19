import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Building2, Users, UserRound, FolderTree } from "lucide-react";
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
import { fetchWorkspace, criticalityLabel, type Person } from "@/lib/talent";

export const Route = createFileRoute("/org")({
  head: () => ({
    meta: [
      { title: "组织 & 人员视图 — 战略岗位与人才" },
      {
        name: "description",
        content: "从 Lab 到 Team 到人，逐层展开组织结构，点开成员查看岗位、技能与能力承载详情。",
      },
      { property: "og:title", content: "组织 & 人员视图 — 战略岗位与人才" },
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

type OrgNode = {
  id: string;
  parent_id: string | null;
  name: string;
  type: string;
  mission: string | null;
  archived: boolean;
  sort_order: number;
};

async function fetchOrgTree() {
  const { data, error } = await supabase.from("org_nodes").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as OrgNode[];
}

function OrgPage() {
  return (
    <AppShell
      title="组织 & 人员视图"
      subtitle="系统设置里维护的 Lab / Team 结构，在这里逐层展开：每个团队下挂着成员，点开成员即可看到他的岗位、技能对照与能力承载。"
    >
      <OrgTreeBody />
    </AppShell>
  );
}

function OrgTreeBody() {
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const tree = useQuery({ queryKey: ["org-tree"], queryFn: fetchOrgTree });

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

  const assign = useMutation({
    mutationFn: async ({ pid, nodeId }: { pid: string; nodeId: string | null }) => {
      const { error } = await supabase.from("people").update({ org_node_id: nodeId }).eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("归属已更新");
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectableNodes = nodes.filter((n) => n.type !== "VNRC");

  const roots = childrenOf.get("__root") ?? [];

  const renderNode = (node: OrgNode, depth: number) => {
    const kids = childrenOf.get(node.id) ?? [];
    const members = peopleOf.get(node.id) ?? [];
    const isOpen = expanded[node.id] ?? depth < 1;
    const total = countIn(node.id);
    const Icon = node.type === "Team" ? Users : Building2;

    return (
      <div key={node.id} className="rounded-xl border border-border/60 bg-surface-raised/40">
        <button
          type="button"
          onClick={() => setExpanded((s) => ({ ...s, [node.id]: !isOpen }))}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised/70"
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
          <span className="shrink-0 text-xs text-muted-foreground">{total} 人</span>
        </button>

        {isOpen && (
          <div className="space-y-2 border-t border-border/50 px-3 py-3 pl-6">
            {kids.map((k) => renderNode(k, depth + 1))}

            {members.map((p) => {
              const role = roles.find((r) => r.id === p.role_id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonId(p.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-left transition-colors hover:border-brand/50 hover:bg-surface-raised/60"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    {p.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.name}
                      {p.level ? (
                        <span className="ml-2 text-xs text-muted-foreground">L{p.level}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {role ? `${role.title} · ${criticalityLabel[role.criticality] ?? role.criticality}` : "未匹配战略岗位"}
                    </p>
                  </div>
                  <UserRound className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}

            {kids.length === 0 && members.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">该节点下暂无子团队或成员。</p>
            )}
          </div>
        )}
      </div>
    );
  };

  if (ws.isLoading || tree.isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="组织节点" value={nodes.length} />
        <StatTile label="已归属成员" value={`${people.length - unassigned.length} / ${people.length}`} />
        <StatTile
          label="未归属成员"
          value={unassigned.length}
          tone={unassigned.length > 0 ? "warn" : "ok"}
        />
      </div>

      {roots.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-surface-raised/40 p-8 text-center">
          <FolderTree className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            还没有组织结构，请先在「系统设置 → 组织管理」中创建 Lab 与 Team。
          </p>
        </div>
      ) : (
        <div className="space-y-3">{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {unassigned.length > 0 && (
        <section className="rounded-xl border border-warn/40 bg-surface-raised/40 p-4">
          <h2 className="font-display text-sm font-semibold">未归属成员</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            为他们指定所属 Lab / Team，组织树就会自动关联。
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
                    <SelectValue placeholder="选择所属团队" />
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
            展开全部
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded({})}>
            收起
          </Button>
        </div>
      )}

      <PersonDetailSheet
        person={people.find((p) => p.id === personId) ?? null}
        people={people}
        roles={roles}
        directions={directions}
        open={!!personId}
        onOpenChange={(v) => !v && setPersonId(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["workspace"] })}
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
        onDone={() => qc.invalidateQueries({ queryKey: ["workspace"] })}
      />
    </div>
  );
}

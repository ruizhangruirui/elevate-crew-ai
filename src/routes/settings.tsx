import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Archive, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "系统设置 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "集中管理组织结构、人员操作、权限范围、人才配置项与操作审计记录。",
      },
      { property: "og:title", content: "系统设置 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "集中管理组织结构、人员操作、权限范围、人才配置项与操作审计记录。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const SECTIONS = [
  "组织管理",
  "人员管理",
  "权限管理",
  "人才配置",
  "操作记录",
  "系统设置",
] as const;
type Section = (typeof SECTIONS)[number];

type OrgNode = {
  id: string;
  parent_id: string | null;
  name: string;
  type: string;
  mission: string | null;
  archived: boolean;
  sort_order: number;
};
type ConfigItem = {
  id: string;
  category: string;
  name: string;
  active: boolean;
  sort_order: number;
};
type AccessUser = {
  id: string;
  name: string;
  role_label: string;
  scope: string[];
  status: string;
};
type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string | null;
  detail: string | null;
  created_at: string;
};

const CONFIG_GROUPS: [string, string][] = [
  ["tags", "Talent Tags"],
  ["awards", "Awards"],
  ["criticalities", "Strategic Role Criticality"],
  ["coverageStatuses", "Coverage Status"],
  ["readiness", "Readiness"],
  ["futureRoleRelationships", "Future Role Relationship"],
  ["riskTypes", "Risk Types"],
  ["talentRecordTypes", "Talent Record Types"],
  ["actionTypes", "Talent Action Types"],
  ["activityTypes", "Activity Types"],
];

async function fetchSettings() {
  const [orgNodes, config, users, audit] = await Promise.all([
    supabase.from("org_nodes").select("*").order("sort_order"),
    supabase.from("config_items").select("*").order("sort_order"),
    supabase.from("access_users").select("*").order("created_at"),
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const err = orgNodes.error || config.error || users.error || audit.error;
  if (err) throw err;
  return {
    orgNodes: (orgNodes.data ?? []) as OrgNode[],
    config: (config.data ?? []) as ConfigItem[],
    users: (users.data ?? []) as AccessUser[],
    audit: (audit.data ?? []) as AuditRow[],
  };
}

async function logAudit(action: string, entity: string, detail: string) {
  await supabase.from("audit_log").insert({ action, entity, detail });
}

function SettingsPage() {
  return (
    <AppShell
      title="系统设置"
      subtitle="集中管理组织、人员、权限、配置、确认变更与审计记录。"
    >
      <SettingsBody />
    </AppShell>
  );
}

function SettingsBody() {
  const [section, setSection] = useState<Section>("组织管理");
  const { data } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="flex flex-wrap gap-1 lg:flex-col">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              section === s
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--color-brand)]"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </nav>

      <div className="panel min-h-[24rem] p-6">
        {!data ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : section === "组织管理" ? (
          <OrgSection nodes={data.orgNodes} />
        ) : section === "人员管理" ? (
          <PeopleOpsSection />
        ) : section === "权限管理" ? (
          <AccessSection users={data.users} />
        ) : section === "人才配置" ? (
          <ConfigSection items={data.config} />
        ) : section === "操作记录" ? (
          <AuditSection rows={data.audit} />
        ) : (
          <SystemSection />
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/* ---------------- 组织管理 ---------------- */

function OrgSection({ nodes }: { nodes: OrgNode[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<OrgNode> | null>(null);
  const live = nodes.filter((n) => !n.archived);

  const save = useMutation({
    mutationFn: async (node: Partial<OrgNode>) => {
      if (node.id) {
        const { error } = await supabase
          .from("org_nodes")
          .update({
            name: node.name ?? "",
            mission: node.mission ?? null,
            parent_id: node.parent_id ?? null,
          })
          .eq("id", node.id);
        if (error) throw error;
        await logAudit("Edit", "组织结构", `更新 ${node.name}`);
      } else {
        const id = `node-${Date.now()}`;
        const { error } = await supabase.from("org_nodes").insert({
          id,
          name: node.name!,
          type: node.type ?? "Team",
          mission: node.mission ?? null,
          parent_id: node.parent_id ?? "vnrc",
          sort_order: 99,
        });
        if (error) throw error;
        await logAudit("Create", "组织结构", `新增 ${node.type} ${node.name}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setEditing(null);
      toast.success("组织结构已更新");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (node: OrgNode) => {
      const { error } = await supabase
        .from("org_nodes")
        .update({ archived: true })
        .eq("id", node.id);
      if (error) throw error;
      await logAudit("Archive", "组织结构", `归档 ${node.name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("已归档");
    },
  });

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode =>
    live
      .filter((n) => n.parent_id === parentId)
      .map((node) => (
        <div key={node.id}>
          <div
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3"
            style={{ marginLeft: depth * 20 }}
          >
            <div className="min-w-0">
              <p className="font-medium">
                {node.name}{" "}
                <Badge variant="secondary" className="ml-1 align-middle text-[10px]">
                  {node.type}
                </Badge>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{node.mission || "No mission"}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(node)}>
                <Pencil className="size-3.5" /> 编辑
              </Button>
              {node.id !== "vnrc" && (
                <Button size="sm" variant="ghost" onClick={() => archive.mutate(node)}>
                  <Archive className="size-3.5" /> 归档
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 space-y-2">{renderTree(node.id, depth + 1)}</div>
        </div>
      ));

  return (
    <>
      <SectionHeader
        title="组织管理"
        desc="维护 VNRC / Lab / Team 结构，组织变更会写入操作记录。"
      >
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing({ type: "Lab", parent_id: "vnrc" })}
        >
          <Plus className="size-3.5" /> 新增 Lab
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing({ type: "Team", parent_id: "lab-network" })}
        >
          <Plus className="size-3.5" /> 新增 Team
        </Button>
      </SectionHeader>

      <div className="space-y-2">{renderTree(null)}</div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "编辑组织" : `新增 ${editing?.type}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={editing?.name ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p!, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>上级组织</Label>
              <Select
                value={editing?.parent_id ?? "vnrc"}
                onValueChange={(v) => setEditing((p) => ({ ...p!, parent_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {live
                    .filter((n) => n.id !== editing?.id)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>使命</Label>
              <Textarea
                rows={3}
                value={editing?.mission ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p!, mission: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => editing?.name && save.mutate(editing)}
              disabled={save.isPending}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- 人员管理 ---------------- */

function PeopleOpsSection() {
  const { data } = useQuery({
    queryKey: ["people-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("people")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const exportPeople = async () => {
    const { data: rows } = await supabase.from("people").select("*");
    const csv = [
      "name,level,status,note",
      ...(rows ?? []).map((r) => `${r.name},${r.level ?? ""},${r.status},${r.note ?? ""}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees.csv";
    a.click();
    URL.revokeObjectURL(url);
    await logAudit("Export", "人员数据", "导出员工 CSV");
    toast.success("已导出员工数据");
  };

  return (
    <>
      <SectionHeader title="人员管理" desc="新增、导出与归档员工数据，明细操作在人员视图中完成。" />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" asChild>
          <a href="/people">前往人员视图新增 / 编辑</a>
        </Button>
        <Button variant="secondary" size="sm" onClick={exportPeople}>
          <Download className="size-3.5" /> Export Employees
        </Button>
      </div>
      <div className="mt-6 rounded-lg border border-border/60 bg-card/40 p-4">
        <p className="text-sm font-medium">人员总览</p>
        <p className="mt-1 text-sm text-muted-foreground">
          当前系统内共有 {data ?? 0} 位在册人员（含候选人）。
        </p>
      </div>
    </>
  );
}

/* ---------------- 权限管理 ---------------- */

const ROLE_DEFS: [string, string][] = [
  ["System Owner", "All Research Center data"],
  ["Viewer", "All Research Center review access"],
  ["Lab Manager", "单个 Lab 范围"],
  ["Team Manager", "单个 Team 范围"],
  ["HRBP", "多 Lab / Team 人才范围"],
];

function AccessSection({ users }: { users: AccessUser[] }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: async (u: AccessUser) => {
      const status = u.status === "Active" ? "Inactive" : "Active";
      const { error } = await supabase.from("access_users").update({ status }).eq("id", u.id);
      if (error) throw error;
      await logAudit("Permission Change", "权限管理", `${u.name} → ${status}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("权限已更新");
    },
  });

  return (
    <>
      <SectionHeader
        title="权限管理"
        desc="Role + Scope + Permissions 共同决定用户可见和可编辑范围。"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell>{u.role_label}</TableCell>
              <TableCell className="text-muted-foreground">{u.scope.join(", ")}</TableCell>
              <TableCell>
                <Badge variant={u.status === "Active" ? "default" : "secondary"}>{u.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)}>
                  {u.status === "Active" ? "停用" : "启用"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h3 className="mt-8 mb-3 font-display text-base font-semibold">Role definitions</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Access scope</TableHead>
            <TableHead>Assigned people</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROLE_DEFS.map(([label, scope]) => (
            <TableRow key={label}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="text-muted-foreground">{scope}</TableCell>
              <TableCell className="text-muted-foreground">
                {users.filter((u) => u.role_label === label).map((u) => u.name).join("、") || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

/* ---------------- 人才配置 ---------------- */

function ConfigSection({ items }: { items: ConfigItem[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState("");

  const mutate = useMutation({
    mutationFn: async (op: { type: "add" | "toggle" | "delete"; item?: ConfigItem; category?: string }) => {
      if (op.type === "add") {
        const { error } = await supabase
          .from("config_items")
          .insert({ category: op.category!, name, sort_order: 99 });
        if (error) throw error;
        await logAudit("Create", "人才配置", `新增 ${op.category}: ${name}`);
      } else if (op.type === "toggle") {
        const { error } = await supabase
          .from("config_items")
          .update({ active: !op.item!.active })
          .eq("id", op.item!.id);
        if (error) throw error;
        await logAudit("Edit", "人才配置", `${op.item!.name} 状态切换`);
      } else {
        const { error } = await supabase.from("config_items").delete().eq("id", op.item!.id);
        if (error) throw error;
        await logAudit("Delete", "人才配置", `删除 ${op.item!.name}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setAdding(null);
      setName("");
      toast.success("配置已更新");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SectionHeader
        title="人才配置"
        desc="维护标签、奖项、岗位关键性、覆盖状态、Readiness、Future Role 关系与记录类型。"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {CONFIG_GROUPS.map(([key, title]) => (
          <article key={key} className="rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{title}</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(key);
                  setName("");
                }}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            <ul className="space-y-1.5">
              {items
                .filter((i) => i.category === key)
                .map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className={item.active ? "" : "text-muted-foreground line-through"}>
                      {item.name}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => mutate.mutate({ type: "toggle", item })}
                      >
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                      {!item.active && (
                        <button
                          className="text-xs text-destructive hover:opacity-80"
                          onClick={() => mutate.mutate({ type: "delete", item })}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              {items.filter((i) => i.category === key).length === 0 && (
                <li className="text-xs text-muted-foreground">暂无配置项</li>
              )}
            </ul>
          </article>
        ))}
      </div>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增配置项</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              disabled={!name.trim()}
              onClick={() => mutate.mutate({ type: "add", category: adding! })}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- 操作记录 ---------------- */

function AuditSection({ rows }: { rows: AuditRow[] }) {
  const exportLog = async () => {
    const csv = [
      "time,actor,action,entity,detail",
      ...rows.map((r) => `${r.created_at},${r.actor},${r.action},${r.entity ?? ""},${r.detail ?? ""}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出操作记录");
  };

  return (
    <>
      <SectionHeader
        title="操作记录"
        desc="Create / Edit / Delete / Archive / Transfer / Permission Change 自动记录。"
      >
        <Button size="sm" variant="secondary" onClick={exportLog}>
          <Download className="size-3.5" /> Export Audit Log
        </Button>
      </SectionHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>动作</TableHead>
            <TableHead>对象</TableHead>
            <TableHead>说明</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(r.created_at).toLocaleString("zh-CN")}
              </TableCell>
              <TableCell>{r.actor}</TableCell>
              <TableCell>
                <Badge variant="secondary">{r.action}</Badge>
              </TableCell>
              <TableCell>{r.entity ?? "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.detail ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

/* ---------------- 系统设置 ---------------- */

function SystemSection() {
  const [language, setLanguage] = useState("中文");
  const exportAll = async () => {
    const [orgs, directions, roles, people] = await Promise.all([
      supabase.from("orgs").select("*"),
      supabase.from("directions").select("*"),
      supabase.from("roles").select("*"),
      supabase.from("people").select("*"),
    ]);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            orgs: orgs.data,
            directions: directions.data,
            roles: roles.data,
            people: people.data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "talent-data.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出全部数据");
  };

  return (
    <>
      <SectionHeader title="系统设置" desc="语言、外观与数据导出等系统级配置。" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
          <Label>Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="中文">中文</SelectItem>
              <SelectItem value="English">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
          <Label>Appearance</Label>
          <p className="text-sm text-muted-foreground">Midnight Indigo（深色主题）</p>
        </div>
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4 sm:col-span-2">
          <Label>数据</Label>
          <div>
            <Button size="sm" variant="secondary" onClick={exportAll}>
              <Download className="size-3.5" /> Export data
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

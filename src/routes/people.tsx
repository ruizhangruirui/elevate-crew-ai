import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfirmAction } from "@/components/ConfirmAction";
import { PersonDetailSheet } from "@/components/PersonDetailSheet";
import { completeness } from "@/lib/org-tree";
import { Link } from "@tanstack/react-router";
import { RoleDetailSheet } from "@/components/RoleDetailSheet";
import { StatTile } from "@/components/StatTile";
import { fetchWorkspace, type Person } from "@/lib/talent";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "人员视图 · 战略岗位与人才管理系统" },
      { name: "description", content: "查看在岗人员与候选人的职级分布、岗位归属与人才缺口。" },
      { property: "og:title", content: "人员视图 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "查看在岗人员与候选人的职级分布、岗位归属与人才缺口。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  return (
    <AppShell title="人员视图" subtitle="管理在岗人员与候选人，追踪职级分布与岗位归属。">
      <PeopleBody />
    </AppShell>
  );
}

function PeopleBody() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [open, setOpen] = useState(false);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", level: "15", role_id: "none", status: "onboard" });

  const addPerson = useMutation({
    mutationFn: async () => {
      if (!data?.org) throw new Error("组织尚未初始化");
      const { error } = await supabase.from("people").insert({
        org_id: data.org.id,
        name: form.name,
        level: Number(form.level) || null,
        role_id: form.role_id === "none" ? null : form.role_id,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已添加人员");
      setOpen(false);
      setForm({ name: "", level: "15", role_id: "none", status: "onboard" });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePerson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已移除");
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const roleName = (id: string | null) =>
    data.roles.find((r) => r.id === id)?.title ?? "未分配岗位";
  const onboard = data.people.filter((p) => p.status === "onboard");
  const candidates = data.people.filter((p) => p.status === "candidate");
  const unassigned = data.people.filter((p) => !p.role_id);
  const incomplete = new Map(
    completeness(data.people).rows.map((r) => [r.person.id, r.missing.length]),
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="总人数" value={data.people.length} />
        <StatTile label="在岗" value={onboard.length} tone="ok" />
        <StatTile label="候选人" value={candidates.length} tone="warn" />
        <StatTile label="未分配岗位" value={unassigned.length} tone="danger" />
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">人员名单</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              全员平铺清单；按团队层级浏览与数据完整度详情见
              <Link to="/org" className="ml-1 text-brand hover:underline">
                组织 & 人员视图
              </Link>
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="size-4" /> 新增人员
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新增人员</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>姓名</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>职级</Label>
                    <Input
                      type="number"
                      value={form.level}
                      onChange={(e) => setForm({ ...form, level: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>状态</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onboard">在岗</SelectItem>
                        <SelectItem value="candidate">候选人</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>目标岗位</Label>
                  <Select
                    value={form.role_id}
                    onValueChange={(v) => setForm({ ...form, role_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未分配</SelectItem>
                      {data.roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addPerson.mutate()}
                  disabled={!form.name.trim() || addPerson.isPending}
                >
                  保存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="divide-y divide-border/50">
          {data.people.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setActivePersonId(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActivePersonId(p.id);
                }
              }}
              className="flex cursor-pointer flex-wrap items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-raised/50"
            >
              <div
                className="grid size-10 shrink-0 place-items-center rounded-full border border-border/70 bg-surface-raised font-display text-sm font-semibold"
                aria-hidden
              >
                {p.name.slice(0, 1)}
              </div>
              <div className="min-w-40 flex-1">
                <p className="font-display font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{roleName(p.role_id)}</p>
              </div>
              <span className="rounded-md border border-border/70 px-2 py-1 text-xs tabular-nums text-muted-foreground">
                Level {p.level ?? "—"}
              </span>
              <span
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  p.status === "onboard"
                    ? "bg-ok/12 text-ok"
                    : "bg-warn/12 text-warn"
                }`}
              >
                {p.status === "onboard" ? "在岗" : "候选人"}
              </span>
              <p className="hidden max-w-56 truncate text-xs text-muted-foreground lg:block">
                {p.note}
              </p>
              {incomplete.has(p.id) && (
                <span className="rounded-md bg-warn/12 px-2 py-1 text-xs font-medium text-warn">
                  资料不全 {incomplete.get(p.id)} 项
                </span>
              )}
              <ConfirmAction
                title={`确认删除「${p.name}」？`}
                description={
                  <>
                    <p>该人员的所有评估信息、岗位归属与 AI 匹配记录都会一并删除，且无法恢复。</p>
                    <p>如果只是离岗，建议改为在详情里把状态改为「候选人」或移除岗位归属。</p>
                  </>
                }
                confirmLabel="仍要删除"
                onConfirm={() => removePerson.mutate(p.id)}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-danger"
                  aria-label={`移除 ${p.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </ConfirmAction>
            </div>
          ))}
          {data.people.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">暂无人员</p>
          )}
        </div>
      </div>

      <PersonDetailSheet
        person={data.people.find((p) => p.id === activePersonId) ?? null}
        people={data.people}
        roles={data.roles}
        directions={data.directions}
        open={!!activePersonId}
        onOpenChange={(v) => !v && setActivePersonId(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["workspace"] })}
        onOpenRole={(roleId) => {
          setActivePersonId(null);
          setActiveRoleId(roleId);
        }}
      />

      <RoleDetailSheet
        role={data.roles.find((r) => r.id === activeRoleId) ?? null}
        people={data.people}
        directionTitle={
          data.directions.find(
            (d) => d.id === data.roles.find((r) => r.id === activeRoleId)?.direction_id,
          )?.title ?? ""
        }
        open={!!activeRoleId}
        onOpenChange={(v) => !v && setActiveRoleId(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["workspace"] })}
      />
    </div>
  );
}

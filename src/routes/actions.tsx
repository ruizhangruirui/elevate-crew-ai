import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CircleDot, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfirmAction } from "@/components/ConfirmAction";
import { StatTile } from "@/components/StatTile";
import { fetchWorkspace } from "@/lib/talent";
import { fetchOrgNodes } from "@/lib/org-tree";
import {
  actionSummary,
  createAction,
  deleteAction,
  fetchActions,
  inDays,
  isOverdue,
  priorityLabel,
  setActionStatus,
  sourceLabel,
  statusLabel,
  type ActionItem,
  type ActionPriority,
  type ActionStatus,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/actions")({
  head: () => ({
    meta: [
      { title: "待办中心 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "把能力缺口、岗位空缺与 AI 诊断结论落成有负责人、有时间的跟进事项。",
      },
      { property: "og:title", content: "待办中心 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "把能力缺口、岗位空缺与 AI 诊断结论落成有负责人、有时间的跟进事项。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActionsPage,
});

function ActionsPage() {
  return (
    <AppShell
      title="待办中心"
      subtitle="所有分析都要落到一个人、一个日期上。能力缺口、岗位空缺、AI 诊断的结论都汇总在这里跟进。"
    >
      <ActionsBoard />
    </AppShell>
  );
}

function ActionsBoard() {
  const qc = useQueryClient();
  const { data: actions } = useQuery({ queryKey: ["actions"], queryFn: fetchActions });
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: nodes } = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const [tab, setTab] = useState<"open" | "done" | "all">("open");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["actions"] });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ActionStatus }) =>
      setActionStatus(id, status),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAction(id),
    onSuccess: () => {
      toast.success("已删除待办");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = actions ?? [];
  const s = useMemo(() => actionSummary(list), [list]);

  const shown = list.filter((a) =>
    tab === "open"
      ? a.status === "todo" || a.status === "doing"
      : tab === "done"
        ? a.status === "done"
        : true,
  );

  const context = (a: ActionItem) => {
    const bits: string[] = [];
    const role = ws?.roles.find((r) => r.id === a.role_id);
    const person = ws?.people.find((p) => p.id === a.person_id);
    const node = (nodes ?? []).find((n) => n.id === a.org_node_id);
    if (role) bits.push(`岗位：${role.title}`);
    if (person) bits.push(`人员：${person.name}`);
    if (node) bits.push(`团队：${node.name}`);
    return bits;
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="进行中的事项" value={s.open} />
        <StatTile label="已逾期" value={s.overdue} tone={s.overdue ? "danger" : "ok"} />
        <StatTile label="高优先级" value={s.high} tone={s.high ? "warn" : "ok"} />
        <StatTile label="已完成" value={s.done} tone="ok" />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["open", "done", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                tab === t
                  ? "border-brand bg-brand/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "open" ? "进行中" : t === "done" ? "已完成" : "全部"}
            </button>
          ))}
        </div>
        <NewActionDialog onDone={invalidate} />
      </section>

      <section className="panel divide-y divide-border/40">
        {shown.map((a) => {
          const over = isOverdue(a);
          const done = a.status === "done";
          return (
            <article key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <button
                onClick={() =>
                  move.mutate({ id: a.id, status: done ? "todo" : "done" })
                }
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
                  done ? "border-ok bg-ok/20 text-ok" : "border-border hover:border-brand"
                }`}
                aria-label={done ? "标记为未完成" : "标记为已完成"}
              >
                {done && <CircleDot className="size-3" />}
              </button>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
                  {a.title}
                </p>
                {a.detail && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.detail}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted/40 px-1.5 py-0.5">
                    {sourceLabel[a.source_kind] ?? a.source_kind}
                  </span>
                  <span
                    className={
                      a.priority === "high"
                        ? "text-danger"
                        : a.priority === "low"
                          ? ""
                          : "text-warn"
                    }
                  >
                    优先级 {priorityLabel[a.priority] ?? a.priority}
                  </span>
                  {a.owner && <span>负责人：{a.owner}</span>}
                  {a.due_on && (
                    <span className={`inline-flex items-center gap-1 ${over ? "text-danger" : ""}`}>
                      <CalendarDays className="size-3" />
                      {a.due_on}
                      {over && " · 已逾期"}
                    </span>
                  )}
                  {context(a).map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!done && (
                  <Select
                    value={a.status}
                    onValueChange={(v) => move.mutate({ id: a.id, status: v as ActionStatus })}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">{statusLabel["todo"]}</SelectItem>
                      <SelectItem value="doing">{statusLabel["doing"]}</SelectItem>
                      <SelectItem value="done">{statusLabel["done"]}</SelectItem>
                      <SelectItem value="cancelled">{statusLabel["cancelled"]}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <ConfirmAction
                  title="确认删除这条待办？"
                  description={<p>删除后无法恢复，跟进记录也会一并消失。</p>}
                  confirmLabel="确认删除"
                  onConfirm={() => remove.mutate(a.id)}
                >
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <Trash2 className="size-3.5" />
                  </Button>
                </ConfirmAction>
              </div>
            </article>
          );
        })}

        {shown.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            这里还没有事项。去「组织能力视图」或「组织 &amp; 人员视图」里，把分析结论转成待办。
          </p>
        )}
      </section>
    </div>
  );
}

function NewActionDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    detail: "",
    owner: "",
    due_on: inDays(30),
    priority: "normal" as ActionPriority,
  });

  const create = useMutation({
    mutationFn: () =>
      createAction({
        title: form.title,
        detail: form.detail,
        source_kind: "manual",
        source_key: null,
        owner: form.owner,
        due_on: form.due_on,
        priority: form.priority,
      }),
    onSuccess: () => {
      toast.success("已新增待办");
      setOpen(false);
      setForm({ title: "", detail: "", owner: "", due_on: inDays(30), priority: "normal" });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" /> 新增待办
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增待办</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>事项</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>背景说明</Label>
            <Textarea
              rows={3}
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>负责人</Label>
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>截止日期</Label>
              <Input
                type="date"
                value={form.due_on}
                onChange={(e) => setForm({ ...form, due_on: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>优先级</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as ActionPriority })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="normal">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!form.title.trim() || create.isPending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

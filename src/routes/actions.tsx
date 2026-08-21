import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CircleDot, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfirmAction } from "@/components/ConfirmAction";
import { StatTile } from "@/components/StatTile";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace } from "@/lib/talent";
import { fetchOrgNodes } from "@/lib/org-tree";
import {
  actionSummary,
  createAction,
  deleteAction,
  fetchActions,
  inDays,
  isOverdue,
  setActionStatus,
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
  const { t } = useI18n();
  return (
    <AppShell
      title={t("act.title")}
      subtitle={t("act.subtitle")}
    >
      <ActionsBoard />
    </AppShell>
  );
}

function ActionsBoard() {
  const { t } = useI18n();
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
      toast.success(t("act.toast.deleted"));
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
    if (role) bits.push(`${t("act.context.role")}${role.title}`);
    if (person) bits.push(`${t("act.context.person")}${person.name}`);
    if (node) bits.push(`${t("act.context.team")}${node.name}`);
    return bits;
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("act.stat.open")} value={s.open} />
        <StatTile label={t("act.stat.overdue")} value={s.overdue} tone={s.overdue ? "danger" : "ok"} />
        <StatTile label={t("act.stat.high")} value={s.high} tone={s.high ? "warn" : "ok"} />
        <StatTile label={t("act.stat.done")} value={s.done} tone="ok" />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["open", "done", "all"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                tab === tabKey
                  ? "border-brand bg-brand/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(tabKey === "open" ? "act.tab.open" : tabKey === "done" ? "act.tab.done" : "act.tab.all")}
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
                aria-label={done ? t("act.markUndone") : t("act.markDone")}
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
                    {t(`act.source.${a.source_kind}`) !== `act.source.${a.source_kind}` ? t(`act.source.${a.source_kind}`) : a.source_kind}
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
                    {t("act.priorityPrefix")} {t(`act.priority.${a.priority}`) !== `act.priority.${a.priority}` ? t(`act.priority.${a.priority}`) : a.priority}
                  </span>
                  {a.owner && <span>{t("act.ownerPrefix")}{a.owner}</span>}
                  {a.due_on && (
                    <span className={`inline-flex items-center gap-1 ${over ? "text-danger" : ""}`}>
                      <CalendarDays className="size-3" />
                      {a.due_on}
                      {over && ` · ${t("act.overdueSuffix")}`}
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
                      <SelectItem value="todo">{t("act.status.todo")}</SelectItem>
                      <SelectItem value="doing">{t("act.status.doing")}</SelectItem>
                      <SelectItem value="done">{t("act.status.done")}</SelectItem>
                      <SelectItem value="cancelled">{t("act.status.cancelled")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <ConfirmAction
                  title={t("act.delete.confirmTitle")}
                  description={<p>{t("act.delete.desc")}</p>}
                  confirmLabel={t("act.delete.confirmLabel")}
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
            {t("act.empty")}
          </p>
        )}
      </section>
    </div>
  );
}

function NewActionDialog({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
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
      toast.success(t("act.toast.added"));
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
          <Plus className="size-4" /> {t("act.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("act.dialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("act.field.title")}</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("act.field.detail")}</Label>
            <Textarea
              rows={3}
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("act.field.owner")}</Label>
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("act.field.dueDate")}</Label>
              <Input
                type="date"
                value={form.due_on}
                onChange={(e) => setForm({ ...form, due_on: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("act.field.priority")}</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as ActionPriority })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t("act.priority.high")}</SelectItem>
                  <SelectItem value="normal">{t("act.priority.normal")}</SelectItem>
                  <SelectItem value="low">{t("act.priority.low")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!form.title.trim() || create.isPending}>
            {t("act.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

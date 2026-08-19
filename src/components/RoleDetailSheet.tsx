import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, UserMinus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { coverageOf, criticalityLabel, type Person, type Role } from "@/lib/talent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Module({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function RoleDetailSheet({
  role,
  people,
  directionTitle,
  open,
  onOpenChange,
  onDone,
}: {
  role: Role | null;
  people: Person[];
  directionTitle: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [assignSeat, setAssignSeat] = useState<number | null>(null);

  const owners = role ? people.filter((p) => p.role_id === role.id && p.status === "onboard") : [];
  const unassigned = role ? people.filter((p) => p.role_id !== role.id) : [];
  const cov = role ? coverageOf(role, people) : null;

  const assign = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase
        .from("people")
        .update({ role_id: role!.id, status: "onboard" })
        .eq("id", personId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已指派 Owner");
      setAssignSeat(null);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase.from("people").update({ role_id: null }).eq("id", personId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已移除 Owner");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!role || !cov) return null;

  const pct = Math.min(100, Math.round((cov.filled / Math.max(1, role.target_count)) * 100));
  const risk = cov.state === "empty" ? "High" : cov.state === "partial" ? "Medium" : "Low";
  const coverageLabel =
    cov.state === "full" ? "Fully Covered" : cov.state === "partial" ? "Partially Covered" : "Not Covered";
  const seats = Array.from({ length: role.target_count }, (_, i) => owners[i] ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">{role.title}</SheetTitle>
          <SheetDescription>岗位画像 / 覆盖分析 · {directionTitle}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-10">
          <Module
            title="岗位画像"
            actions={
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    role.criticality === "strategic_critical"
                      ? "bg-danger/12 text-danger"
                      : role.criticality === "critical"
                        ? "bg-warn/12 text-warn"
                        : "bg-surface-raised text-muted-foreground"
                  }`}
                >
                  {criticalityLabel[role.criticality] ?? role.criticality}
                </span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing((v) => !v)}>
                  <Pencil className="size-3.5" /> {editing ? "取消" : "编辑岗位画像"}
                </Button>
              </div>
            }
          >
            {editing ? (
              <EditRoleForm
                role={role}
                onDone={() => {
                  setEditing(false);
                  onDone();
                }}
              />
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {role.description || "暂无岗位描述。"}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Fact label="所属方向" value={directionTitle} />
                  <Fact label="目标级别" value={`${role.level_min}–${role.level_max}`} />
                  <Fact label="目标人数" value={role.target_count} />
                  <Fact label="当前覆盖" value={`${cov.filled}/${role.target_count}`} />
                </div>
              </>
            )}
          </Module>

          <Module
            title="当前人才覆盖"
            actions={
              <span
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  cov.state === "full"
                    ? "bg-ok/12 text-ok"
                    : cov.state === "partial"
                      ? "bg-warn/12 text-warn"
                      : "bg-danger/12 text-danger"
                }`}
              >
                {coverageLabel}
              </span>
            }
          >
            <Progress value={pct} className="h-1.5" />
            <div className="mt-4 space-y-3">
              {seats.map((owner, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/60 bg-surface-raised/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">Seat {i + 1}</strong>
                    <span
                      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                        owner ? "bg-ok/12 text-ok" : "bg-danger/12 text-danger"
                      }`}
                    >
                      {owner ? "Filled" : "Vacant"}
                    </span>
                  </div>
                  {owner ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        {owner.name} · Level {owner.level ?? "-"}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-danger"
                        onClick={() => unassign.mutate(owner.id)}
                      >
                        <UserMinus className="size-3.5" /> 移除 Owner
                      </Button>
                    </div>
                  ) : assignSeat === i ? (
                    <div className="mt-3 flex gap-2">
                      <Select onValueChange={(v) => assign.mutate(v)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="选择人员" />
                        </SelectTrigger>
                        <SelectContent>
                          {unassigned.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · Level {p.level ?? "-"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => setAssignSeat(null)}>
                        取消
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        当前 Vacant，需要内部 backup 或外部 KPA。
                      </p>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAssignSeat(i)}>
                        <UserPlus className="size-3.5" /> Assign Owner
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Module>

          <Module title="Gap / Risk / Action">
            <div className="grid gap-2 sm:grid-cols-3">
              <Fact
                label="Gap"
                value={cov.gap ? `缺口 ${cov.gap} 个 Seat` : "无关键缺口"}
              />
              <Fact label="Risk" value={risk} />
              <Fact label="覆盖率" value={`${pct}%`} />
            </div>
          </Module>

          <Module title="AI 辅助判断">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  t: "当前判断",
                  s: coverageLabel,
                  d:
                    cov.state === "empty"
                      ? "岗位存在未覆盖 Seat，需同时推进内部培养与外部 mapping。"
                      : cov.state === "partial"
                        ? "当前 owner 具备基础覆盖，但关键技能证据不足。"
                        : "当前 owner 与岗位画像匹配度较高。",
                },
                {
                  t: "核心依据",
                  s: `${cov.filled}/${role.target_count} Seat 已覆盖`,
                  d: owners.length ? `在岗：${owners.map((o) => o.name).join("、")}` : "暂无在岗 owner 记录。",
                },
                {
                  t: "建议行动",
                  s: cov.gap ? "启动 KPA / 内部培养" : "保持季度复核",
                  d: cov.gap
                    ? "优先识别内部 backup，同步启动外部 mapping。"
                    : "关注继任梯队与关键技能演进。",
                },
              ].map((c) => (
                <article key={c.t} className="rounded-xl border border-border/60 bg-surface-raised/40 p-4">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{c.t}</p>
                  <p className="mt-1 font-display text-sm font-semibold">{c.s}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.d}</p>
                </article>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">AI 辅助分析 · 最终由 Manager / HR 确认</p>
          </Module>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditRoleForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const [form, setForm] = useState({
    title: role.title,
    description: role.description ?? "",
    level_min: String(role.level_min),
    level_max: String(role.level_max),
    target_count: String(role.target_count),
    criticality: role.criticality,
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("roles")
        .update({
          title: form.title,
          description: form.description,
          level_min: Number(form.level_min),
          level_max: Number(form.level_max),
          target_count: Number(form.target_count),
          criticality: form.criticality,
        })
        .eq("id", role.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("岗位画像已更新");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>岗位名称</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>岗位描述</Label>
        <Textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>最低级别</Label>
          <Input
            type="number"
            value={form.level_min}
            onChange={(e) => setForm({ ...form, level_min: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>最高级别</Label>
          <Input
            type="number"
            value={form.level_max}
            onChange={(e) => setForm({ ...form, level_max: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>目标人数</Label>
          <Input
            type="number"
            value={form.target_count}
            onChange={(e) => setForm({ ...form, target_count: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>关键度</Label>
        <Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strategic_critical">Strategic Critical</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="important">Important</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => save.mutate()} disabled={!form.title.trim() || save.isPending}>
        保存
      </Button>
    </div>
  );
}
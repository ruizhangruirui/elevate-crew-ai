import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, ExternalLink, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  coverageOf,
  criticalityLabel,
  type Direction,
  type Person,
  type Role,
  type Skill,
} from "@/lib/talent";
import { buildCapabilities, normalizeKey, levelRank } from "@/lib/capability";
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

const readinessLabel: Record<string, string> = {
  ready: "Ready now",
  ready_1y: "1 年内可上手",
  ready_2y: "2 年内可上手",
  unknown: "未评估",
};
const riskLabel: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  unknown: "未评估",
};
const perfLabel: Record<string, string> = {
  exceeds: "超出预期",
  meets: "符合预期",
  below: "低于预期",
};

function Fact({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-sm font-semibold ${toneCls}`}>{value}</p>
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

export function PersonDetailSheet({
  person,
  people,
  roles,
  directions,
  open,
  onOpenChange,
  onDone,
  onOpenRole,
}: {
  person: Person | null;
  people: Person[];
  roles: Role[];
  directions: Direction[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  onOpenRole?: (roleId: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  const role = person?.role_id ? roles.find((r) => r.id === person.role_id) ?? null : null;
  const direction = role ? directions.find((d) => d.id === role.direction_id) ?? null : null;

  const fits = useQuery({
    queryKey: ["person-fit", person?.id],
    enabled: !!person && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_role_fit")
        .select("*")
        .eq("person_id", person!.id)
        .order("fit_score", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 该人员承载的组织能力（来自其岗位画像），并标注是否为单点承载
  const carried = useMemo(() => {
    if (!person || !role) return [];
    const caps = buildCapabilities(roles, people);
    return caps
      .filter((c) => c.roleIds.includes(role.id))
      .map((c) => ({
        label: c.label,
        kind: c.kind,
        sole: c.carriers.length === 1 && c.carriers[0]?.person.id === person.id,
        assessed: c.carriers.find((x) => x.person.id === person.id)?.assessed ?? false,
      }));
  }, [person, role, roles, people]);

  const skillMatch = useMemo(() => {
    if (!role) return [];
    const own = (person?.assessed_skills ?? []) as Skill[];
    return (role.skills ?? []).map((req) => {
      const k = normalizeKey(req.skill);
      const hit = own.find((s) => {
        const sk = normalizeKey(s.skill ?? "");
        return sk && (sk === k || sk.includes(k) || k.includes(sk));
      });
      const ok = !!hit && levelRank(hit.level) >= levelRank(req.level);
      return { skill: req.skill, required: req.level, actual: hit?.level ?? null, ok };
    });
  }, [role, person]);

  const teammates = role
    ? people.filter((p) => p.role_id === role.id && p.id !== person?.id)
    : [];
  const cov = role ? coverageOf(role, people) : null;

  const [form, setForm] = useState({
    performance: "",
    tenure_months: "",
    readiness: "unknown",
    attrition_risk: "unknown",
    prior_experience: "",
    assessed_skills: "",
    note: "",
    role_id: "none",
    level: "",
    status: "onboard",
  });

  function startEdit() {
    if (!person) return;
    setForm({
      performance: person.performance ?? "",
      tenure_months: person.tenure_months != null ? String(person.tenure_months) : "",
      readiness: person.readiness ?? "unknown",
      attrition_risk: person.attrition_risk ?? "unknown",
      prior_experience: (person.prior_experience ?? []).join("\n"),
      assessed_skills: ((person.assessed_skills ?? []) as Skill[])
        .map((s) => `${s.skill} | ${s.level ?? ""}`)
        .join("\n"),
      note: person.note ?? "",
      role_id: person.role_id ?? "none",
      level: person.level != null ? String(person.level) : "",
      status: person.status ?? "onboard",
    });
    setEditing(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const skills = form.assessed_skills
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [skill, level] = l.split("|").map((x) => x.trim());
          return { skill: skill ?? "", level: level || "Working" };
        })
        .filter((s) => s.skill);
      const { error } = await supabase
        .from("people")
        .update({
          performance: form.performance || null,
          tenure_months: form.tenure_months ? Number(form.tenure_months) : null,
          readiness: form.readiness,
          attrition_risk: form.attrition_risk,
          prior_experience: form.prior_experience.split("\n").map((s) => s.trim()).filter(Boolean),
          assessed_skills: skills as unknown as never,
          note: form.note || null,
          role_id: form.role_id === "none" ? null : form.role_id,
          level: form.level ? Number(form.level) : null,
          status: form.status,
          assessed_at: new Date().toISOString(),
        })
        .eq("id", person!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已保存评估信息");
      setEditing(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!person) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">{person.name}</SheetTitle>
          <SheetDescription>
            {role ? `${direction?.title ?? "未知方向"} · ${role.title}` : "未分配岗位"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-10">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact label="职级" value={person.level != null ? `Level ${person.level}` : "—"} />
            <Fact
              label="状态"
              value={person.status === "onboard" ? "在岗" : "候选人"}
              tone={person.status === "onboard" ? "ok" : "warn"}
            />
            <Fact label="绩效" value={perfLabel[person.performance ?? ""] ?? "未评估"} />
            <Fact
              label="司龄"
              value={person.tenure_months != null ? `${person.tenure_months} 个月` : "—"}
            />
            <Fact
              label="Readiness"
              value={readinessLabel[person.readiness ?? "unknown"] ?? "未评估"}
              tone={person.readiness === "ready" ? "ok" : undefined}
            />
            <Fact
              label="流失风险"
              value={riskLabel[person.attrition_risk ?? "unknown"] ?? "未评估"}
              tone={
                person.attrition_risk === "high"
                  ? "danger"
                  : person.attrition_risk === "medium"
                    ? "warn"
                    : undefined
              }
            />
          </div>

          {!editing && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
              <Pencil className="size-4" /> 编辑评估信息
            </Button>
          )}

          {editing && (
            <Module title="编辑评估信息（HR / 主管填写）">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
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
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onboard">在岗</SelectItem>
                        <SelectItem value="candidate">候选人</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>司龄（月）</Label>
                    <Input
                      type="number"
                      value={form.tenure_months}
                      onChange={(e) => setForm({ ...form, tenure_months: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>所属岗位</Label>
                  <Select value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未分配</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>绩效</Label>
                    <Select
                      value={form.performance || "unset"}
                      onValueChange={(v) => setForm({ ...form, performance: v === "unset" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">未评估</SelectItem>
                        <SelectItem value="exceeds">超出预期</SelectItem>
                        <SelectItem value="meets">符合预期</SelectItem>
                        <SelectItem value="below">低于预期</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Readiness</Label>
                    <Select value={form.readiness} onValueChange={(v) => setForm({ ...form, readiness: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">未评估</SelectItem>
                        <SelectItem value="ready">Ready now</SelectItem>
                        <SelectItem value="ready_1y">1 年内</SelectItem>
                        <SelectItem value="ready_2y">2 年内</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>流失风险</Label>
                    <Select
                      value={form.attrition_risk}
                      onValueChange={(v) => setForm({ ...form, attrition_risk: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">未评估</SelectItem>
                        <SelectItem value="low">低</SelectItem>
                        <SelectItem value="medium">中</SelectItem>
                        <SelectItem value="high">高</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>已评估技能（每行「技能 | 等级」）</Label>
                  <Textarea
                    rows={4}
                    value={form.assessed_skills}
                    onChange={(e) => setForm({ ...form, assessed_skills: e.target.value })}
                    placeholder={"RTL Design | Expert\nNPU Architecture | Working"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>过往经验（每行一条）</Label>
                  <Textarea
                    rows={3}
                    value={form.prior_experience}
                    onChange={(e) => setForm({ ...form, prior_experience: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>备注</Label>
                  <Textarea
                    rows={2}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>保存</Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>取消</Button>
                </div>
              </div>
            </Module>
          )}

          <Module
            title="所在岗位"
            actions={
              role && onOpenRole ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onOpenRole(role.id)}
                >
                  <ExternalLink className="size-4" /> 查看岗位画像
                </Button>
              ) : null
            }
          >
            {!role ? (
              <p className="text-sm text-muted-foreground">
                该人员尚未分配岗位，可在「编辑评估信息」中指派。
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-foreground">
                    {direction?.title ?? "未知方向"}
                  </span>
                  <span className="rounded-full border border-border/70 px-2.5 py-1">
                    {criticalityLabel[role.criticality] ?? role.criticality}
                  </span>
                  <span className="rounded-full border border-border/70 px-2.5 py-1">
                    Level {role.level_min}–{role.level_max}
                  </span>
                </div>
                {cov && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>岗位覆盖</span>
                      <span className="tabular-nums">
                        {cov.filled}/{role.target_count}（缺口 {cov.gap}）
                      </span>
                    </div>
                    <Progress
                      className="mt-2"
                      value={Math.min(100, (cov.filled / Math.max(1, role.target_count)) * 100)}
                    />
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">同岗位其他人员</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {teammates.length === 0 && (
                      <span className="text-xs text-danger">仅此一人承担该岗位</span>
                    )}
                    {teammates.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full border border-border/70 px-2.5 py-1 text-xs"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Module>

          {role && (
            <Module title="技能对照（岗位要求 vs 已评估）">
              {skillMatch.length === 0 ? (
                <p className="text-sm text-muted-foreground">该岗位尚未定义技能要求。</p>
              ) : (
                <ul className="space-y-2">
                  {skillMatch.map((s) => (
                    <li
                      key={s.skill}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2"
                    >
                      <span className="text-sm">{s.skill}</span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">要求 {s.required}</span>
                        <span className={s.ok ? "text-ok" : "text-warn"}>
                          实际 {s.actual ?? "未评估"}
                        </span>
                        {s.ok ? (
                          <Check className="size-4 text-ok" />
                        ) : (
                          <AlertTriangle className="size-4 text-warn" />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Module>
          )}

          {role && (
            <Module title="承载的组织能力">
              {carried.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无关联能力。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {carried.map((c) => (
                    <span
                      key={`${c.kind}-${c.label}`}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        c.sole
                          ? "border-danger/50 bg-danger/10 text-danger"
                          : "border-border/70 text-foreground"
                      }`}
                      title={c.sole ? "组织内仅此一人承载（单点风险）" : undefined}
                    >
                      {c.label}
                      {c.sole ? " · 单点" : ""}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                红色标记表示组织内仅此一人承载，该人员离开会直接造成能力空白。
              </p>
            </Module>
          )}

          <Module title="AI 人岗匹配记录">
            {fits.isLoading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : (fits.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无匹配记录，可在岗位画像里运行「AI 人岗匹配分析」。
              </p>
            ) : (
              <ul className="space-y-2">
                {(fits.data ?? []).map((f) => {
                  const r = roles.find((x) => x.id === f.role_id);
                  return (
                    <li
                      key={f.id}
                      className="rounded-lg border border-border/60 bg-surface-raised/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          className="text-left font-display text-sm font-semibold hover:text-brand"
                          onClick={() => r && onOpenRole?.(r.id)}
                        >
                          {r?.title ?? "已删除岗位"}
                        </button>
                        <span className="font-display text-sm tabular-nums text-brand">
                          {f.fit_score}
                        </span>
                      </div>
                      {f.summary && (
                        <p className="mt-1 text-xs text-muted-foreground">{f.summary}</p>
                      )}
                      {f.recommendation && (
                        <p className="mt-1 text-xs text-foreground/80">建议：{f.recommendation}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Module>

          {(person.prior_experience ?? []).length > 0 && (
            <Module title="过往经验">
              <ul className="space-y-1.5 text-sm text-foreground/85">
                {(person.prior_experience ?? []).map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            </Module>
          )}

          {person.note && (
            <Module title="备注">
              <p className="text-sm text-foreground/85">{person.note}</p>
            </Module>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

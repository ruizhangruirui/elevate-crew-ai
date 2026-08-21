import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, ExternalLink, AlertTriangle, Check, ChevronRight, Plus, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  coverageOf,
  criticalityLabel,
  type Direction,
  type Person,
  type Role,
  type Skill,
} from "@/lib/talent";
import { buildCapabilities, normalizeKey, levelRank, carrierRiskTier } from "@/lib/capability";
import { fetchOrgNodes } from "@/lib/org-tree";
import { useI18n } from "@/lib/i18n";
import { contractLabel } from "@/lib/contract";
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

function readinessLabelOf(t: (k: string) => string, key: string): string {
  const map: Record<string, string> = {
    ready: t("sheet.person.readyNow"),
    ready_1y: t("sheet.person.ready1yFull"),
    ready_2y: t("sheet.person.ready2yFull"),
    unknown: t("sheet.person.notAssessed"),
  };
  return map[key] ?? key;
}
function riskLabelOf(t: (k: string) => string, key: string): string {
  const map: Record<string, string> = {
    low: t("sheet.person.riskLow"),
    medium: t("sheet.person.riskMedium"),
    high: t("sheet.person.riskHigh"),
    unknown: t("sheet.person.notAssessed"),
  };
  return map[key] ?? key;
}
function perfLabelOf(t: (k: string) => string, key: string): string {
  const map: Record<string, string> = {
    exceeds: t("sheet.person.exceedsExpectation"),
    meets: t("sheet.person.meetsExpectation"),
    below: t("sheet.person.belowExpectation"),
  };
  return map[key] ?? key;
}

const SKILL_LEVELS = ["Proficient", "Advanced", "Expert"] as const;

/** 等级刻度：空心=要求，实心=实际 */
function LevelScale({ required, actual }: { required: string; actual: string | null }) {
  const req = levelRank(required);
  const act = levelRank(actual);
  return (
    <span className="flex items-center gap-0.5" title={`${required} / ${actual ?? "-"}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`size-2 rounded-full border ${
            i <= act
              ? act >= req
                ? "border-ok bg-ok"
                : "border-warn bg-warn"
              : i <= req
                ? "border-muted-foreground/60"
                : "border-transparent"
          }`}
        />
      ))}
    </span>
  );
}

/** 折叠展示低信号条目 */
function CollapsedRest({ items, label }: { items: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {label.replace("{n}", String(items.length))}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((i) => (
            <span key={i} className="rounded-full border border-border/70 px-2.5 py-1 text-xs">
              {i}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" | undefined }) {

  const toneCls =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-sm font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}

function Module({
  title,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  badge,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = collapsible ? open : true;
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-left font-display text-base font-semibold hover:text-brand"
          >
            <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
            {title}
            {badge && (
              <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
                {badge}
              </span>
            )}
          </button>
        ) : (
          <h3 className="font-display text-base font-semibold">{title}</h3>
        )}
        {shown && actions}
      </div>
      {shown && <div className="mt-4">{children}</div>}
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
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const orgNodes = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });

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

  const perfRecords = useQuery({
    queryKey: ["person-perf", person?.id],
    enabled: !!person && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_records")
        .select("*")
        .eq("person_id", person!.id)
        .order("recorded_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const history = useQuery({
    queryKey: ["person-audit", person?.id],
    enabled: !!person && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("person_id", person!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [perfForm, setPerfForm] = useState({
    period: "",
    rating: "meets",
    summary: "",
    highlights: "",
    improvements: "",
    reviewer: "",
  });
  const [perfOpen, setPerfOpen] = useState(false);

  const addPerf = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("performance_records").insert({
        person_id: person!.id,
        period: perfForm.period.trim() || new Date().getFullYear().toString(),
        rating: perfForm.rating,
        summary: perfForm.summary || null,
        highlights: perfForm.highlights || null,
        improvements: perfForm.improvements || null,
        reviewer: perfForm.reviewer || null,
      });
      if (error) throw error;
      await supabase.from("audit_log").insert({
        person_id: person!.id,
        action: t("sheet.person.perfAddAction"),
        entity: person!.name,
        detail: `${perfForm.period} · ${perfLabelOf(t, perfForm.rating)}`,
      });
    },
    onSuccess: () => {
      toast.success(t("sheet.person.perfSaved"));
      setPerfOpen(false);
      setPerfForm({ period: "", rating: "meets", summary: "", highlights: "", improvements: "", reviewer: "" });
      perfRecords.refetch();
      history.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });



  // 该人员承载的组织能力（来自其岗位画像），按「能力关键度 × 人员可替代性」分级
  const carried = useMemo(() => {
    if (!person || !role) return [];
    const caps = buildCapabilities(roles, people);
    return caps
      .filter((c) => c.roleIds.includes(role.id))
      .map((c) => {
        const sole = c.carriers.length === 1 && c.carriers[0]?.person.id === person.id;
        const risk = sole ? carrierRiskTier(c, person, people, roles).tier : "normal";
        return {
          label: c.label,
          kind: c.kind,
          sole,
          tier: sole ? risk : ("normal" as const),
          assessed: c.carriers.find((x) => x.person.id === person.id)?.assessed ?? false,
        };
      })
      .sort(
        (a, b) =>
          (b.tier === "critical" ? 2 : b.tier === "watch" ? 1 : 0) -
          (a.tier === "critical" ? 2 : a.tier === "watch" ? 1 : 0),
      );
  }, [person, role, roles, people]);

  const skillMatch = useMemo(() => {
    if (!role) return [];
    const own = (person?.assessed_skills ?? []) as Skill[];
    return (role.skills ?? []).map((req) => {
      const k = normalizeKey(req.skill);
      const exact = own.find((s) => normalizeKey(s.skill ?? "") === k);
      const fuzzy =
        exact ??
        own.find((s) => {
          const sk = normalizeKey(s.skill ?? "");
          return sk && (sk.includes(k) || k.includes(sk));
        });
      const hit = fuzzy ?? null;
      const gap = hit ? levelRank(req.level) - levelRank(hit.level) : null;
      const state: "met" | "minor" | "major" | "none" =
        gap == null ? "none" : gap <= 0 ? "met" : gap === 1 ? "minor" : "major";
      return {
        skill: req.skill,
        required: req.level,
        actual: hit?.level ?? null,
        fuzzy: !!hit && !exact,
        gap,
        state,
      };
    });
  }, [role, person]);

  const skillSummary = useMemo(
    () => ({
      total: skillMatch.length,
      ok: skillMatch.filter((s) => s.state === "met").length,
      minor: skillMatch.filter((s) => s.state === "minor").length,
      major: skillMatch.filter((s) => s.state === "major").length,
      none: skillMatch.filter((s) => s.state === "none").length,
    }),
    [skillMatch],
  );

  const setSkillLevel = useMutation({
    mutationFn: async ({ skill, level }: { skill: string; level: string | null }) => {
      const own = [...((person?.assessed_skills ?? []) as Skill[])];
      const k = normalizeKey(skill);
      const idx = own.findIndex((s) => normalizeKey(s.skill ?? "") === k);
      if (level === null) {
        if (idx >= 0) own.splice(idx, 1);
      } else if (idx >= 0) {
        own[idx] = { skill: own[idx]!.skill, level };
      } else {
        own.push({ skill, level });
      }
      const { error } = await supabase
        .from("people")
        .update({ assessed_skills: own as unknown as never, assessed_at: new Date().toISOString() })
        .eq("id", person!.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        person_id: person!.id,
        action: t("sheet.person.skillChangeAction"),
        entity: person!.name,
        detail: `${skill}: ${level ?? "—"}`,
      });
    },
    onSuccess: () => {
      toast.success(t("sheet.person.levelSaved"));
      history.refetch();
      onDone();
    },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),

  });


  const teammates = role
    ? people.filter((p) => p.role_id === role.id && p.id !== person?.id)
    : [];
  const cov = role ? coverageOf(role, people) : null;

  const [form, setForm] = useState({
    performance: "",
    tenure_months: "",
    contract_type: "unset",
    tags: "",
    readiness: "unknown",
    attrition_risk: "unknown",
    prior_experience: "",
    assessed_skills: "",
    note: "",
    role_id: "none",
    org_node_id: "none",
    level: "",
    status: "onboard",
  });

  function startEdit() {
    if (!person) return;
    setForm({
      performance: person.performance ?? "",
      tenure_months: person.tenure_months != null ? String(person.tenure_months) : "",
      contract_type: person.contract_type || "unset",
      tags: (person.tags ?? []).join(", "),
      readiness: person.readiness ?? "unknown",
      attrition_risk: person.attrition_risk ?? "unknown",
      prior_experience: (person.prior_experience ?? []).join("\n"),
      assessed_skills: ((person.assessed_skills ?? []) as Skill[])
        .map((s) => `${s.skill} | ${s.level ?? ""}`)
        .join("\n"),
      note: person.note ?? "",
      role_id: person.role_id ?? "none",
      org_node_id: person.org_node_id ?? "none",
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
          contract_type: form.contract_type === "unset" ? null : form.contract_type,
          tags: form.tags
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          readiness: form.readiness,
          attrition_risk: form.attrition_risk,
          prior_experience: form.prior_experience.split("\n").map((s) => s.trim()).filter(Boolean),
          assessed_skills: skills as unknown as never,
          note: form.note || null,
          role_id: form.role_id === "none" ? null : form.role_id,
          org_node_id: form.org_node_id === "none" ? null : form.org_node_id,
          level: form.level ? Number(form.level) : null,
          status: form.status,
          assessed_at: new Date().toISOString(),
        })
        .eq("id", person!.id);
      if (error) throw error;

      const nextNode = form.org_node_id === "none" ? null : form.org_node_id;
      if (nextNode !== (person!.org_node_id ?? null)) {
        const nameOf = (id: string | null) =>
          id ? (orgNodes.data ?? []).find((n) => n.id === id)?.name ?? id : t("sheet.person.unassigned");
        await supabase.from("audit_log").insert({
          person_id: person!.id,
          action: t("sheet.person.orgMoveAction"),
          entity: t("sheet.person.orgMoveEntity").replace("{name}", person!.name),
          detail: `${nameOf(person!.org_node_id ?? null)} → ${nameOf(nextNode)}`,
        });
      }

      const diffs: string[] = [];
      const cmp = (label: string, before: string, after: string) => {
        if ((before || "—") !== (after || "—")) diffs.push(`${label}: ${before || "—"} → ${after || "—"}`);
      };
      cmp(t("sheet.person.performance"), perfLabelOf(t, person!.performance ?? ""), perfLabelOf(t, form.performance));
      cmp(t("sheet.person.level"), person!.level != null ? String(person!.level) : "", form.level);
      cmp(t("sheet.person.status"), person!.status ?? "", form.status);
      cmp(t("sheet.person.readiness"), readinessLabelOf(t, person!.readiness ?? "unknown"), readinessLabelOf(t, form.readiness));
      cmp(t("sheet.person.attritionRisk"), riskLabelOf(t, person!.attrition_risk ?? "unknown"), riskLabelOf(t, form.attrition_risk));
      cmp(t("sheet.person.contractType"), person!.contract_type ?? "", form.contract_type === "unset" ? "" : form.contract_type);
      cmp(t("sheet.person.tags"), (person!.tags ?? []).join(", "), form.tags);
      if (diffs.length > 0) {
        await supabase.from("audit_log").insert({
          person_id: person!.id,
          action: t("sheet.person.profileUpdateAction"),
          entity: person!.name,
          detail: diffs.join(" · "),
        });
      }
    },
    onSuccess: () => {
      toast.success(t("sheet.person.assessmentSaved"));
      setEditing(false);
      history.refetch();
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
            {role ? `${direction?.title ?? t("sheet.person.unknownDirection")} · ${role.title}` : t("sheet.person.unassignedRole")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-10">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact label={t("sheet.person.level")} value={person.level != null ? `Level ${person.level}` : "—"} />
            <Fact
              label={t("sheet.person.status")}
              value={person.status === "onboard" ? t("sheet.person.onboard") : t("sheet.person.candidate")}
              tone={person.status === "onboard" ? "ok" : "warn"}
            />
            <Fact label={t("sheet.person.performance")} value={perfLabelOf(t, person.performance ?? "") ?? t("sheet.person.notAssessed")} />
            <Fact label={t("sheet.person.contractType")} value={contractLabel(t, person.contract_type) || t("sheet.person.notFilled")} />
            <Fact
              label={t("sheet.person.team")}
              value={
                (orgNodes.data ?? []).find((n) => n.id === person.org_node_id)?.name ?? t("sheet.person.unassigned")
              }
              tone={person.org_node_id ? undefined : "warn"}
            />
            <Fact
              label={t("sheet.person.tenure")}
              value={person.tenure_months != null ? t("sheet.person.tenureMonths").replace("{n}", String(person.tenure_months)) : "—"}
            />
            <Fact
              label={t("sheet.person.readiness")}
              value={readinessLabelOf(t, person.readiness ?? "unknown") ?? t("sheet.person.notAssessed")}
              tone={person.readiness === "ready" ? "ok" : undefined}
            />
            <Fact
              label={t("sheet.person.attritionRisk")}
              value={riskLabelOf(t, person.attrition_risk ?? "unknown") ?? t("sheet.person.notAssessed")}
              tone={
                person.attrition_risk === "high"
                  ? "danger"
                  : person.attrition_risk === "medium"
                    ? "warn"
                    : undefined
              }
            />
          </div>

          {(person.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(person.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs text-brand"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {!editing && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
              <Pencil className="size-4" /> {t("sheet.person.editAssessment")}
            </Button>
          )}

          {editing && (
            <Module title={t("sheet.person.editAssessmentTitle")}>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("sheet.person.level")}</Label>
                    <Input
                      type="number"
                      value={form.level}
                      onChange={(e) => setForm({ ...form, level: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("sheet.person.status")}</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onboard">{t("sheet.person.onboard")}</SelectItem>
                        <SelectItem value="candidate">{t("sheet.person.candidate")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("sheet.person.tenureMonthsLabel")}</Label>
                    <Input
                      type="number"
                      value={form.tenure_months}
                      onChange={(e) => setForm({ ...form, tenure_months: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.assignedRole")}</Label>
                  <Select value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("sheet.person.notAssigned")}</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.assignedTeam")}</Label>
                  <Select
                    value={form.org_node_id}
                    onValueChange={(v) => setForm({ ...form, org_node_id: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("sheet.person.unassigned")}</SelectItem>
                      {(orgNodes.data ?? [])
                        .filter((n) => n.type !== "VNRC")
                        .map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.name}（{n.type}）
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("sheet.person.performance")}</Label>
                    <Select
                      value={form.performance || "unset"}
                      onValueChange={(v) => setForm({ ...form, performance: v === "unset" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t("sheet.person.notAssessed")}</SelectItem>
                        <SelectItem value="exceeds">{t("sheet.person.exceedsExpectation")}</SelectItem>
                        <SelectItem value="meets">{t("sheet.person.meetsExpectation")}</SelectItem>
                        <SelectItem value="below">{t("sheet.person.belowExpectation")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Readiness</Label>
                    <Select value={form.readiness} onValueChange={(v) => setForm({ ...form, readiness: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">{t("sheet.person.notAssessed")}</SelectItem>
                        <SelectItem value="ready">{t("sheet.person.readyNow")}</SelectItem>
                        <SelectItem value="ready_1y">{t("sheet.person.ready1y")}</SelectItem>
                        <SelectItem value="ready_2y">{t("sheet.person.ready2y")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("sheet.person.attritionRisk")}</Label>
                    <Select
                      value={form.attrition_risk}
                      onValueChange={(v) => setForm({ ...form, attrition_risk: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">{t("sheet.person.notAssessed")}</SelectItem>
                        <SelectItem value="low">{t("sheet.person.riskLow")}</SelectItem>
                        <SelectItem value="medium">{t("sheet.person.riskMedium")}</SelectItem>
                        <SelectItem value="high">{t("sheet.person.riskHigh")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.contractType")}</Label>
                  <Select
                    value={form.contract_type}
                    onValueChange={(v) => setForm({ ...form, contract_type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">{t("sheet.person.notFilled")}</SelectItem>
                      <SelectItem value="正式员工">{t("sheet.person.contractRegular")}</SelectItem>
                      <SelectItem value="外包">{t("sheet.person.contractOutsourced")}</SelectItem>
                      <SelectItem value="实习生">{t("sheet.person.contractIntern")}</SelectItem>
                      <SelectItem value="外部顾问">{t("sheet.person.contractConsultant")}</SelectItem>
                      <SelectItem value="访问学者">{t("sheet.person.contractVisitingScholar")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.tagsLabel")}</Label>
                  <Input
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder={t("sheet.person.tagsPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.assessedSkillsLabel")}</Label>
                  <Textarea
                    rows={4}
                    value={form.assessed_skills}
                    onChange={(e) => setForm({ ...form, assessed_skills: e.target.value })}
                    placeholder={"RTL Design | Expert\nNPU Architecture | Working"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.priorExperienceLabel")}</Label>
                  <Textarea
                    rows={3}
                    value={form.prior_experience}
                    onChange={(e) => setForm({ ...form, prior_experience: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.noteLabel")}</Label>
                  <Textarea
                    rows={2}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("sheet.save")}</Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>{t("sheet.cancel")}</Button>
                </div>
              </div>
            </Module>
          )}

          <Module
            collapsible
            defaultOpen={false}
            title={t("sheet.person.currentRole")}
            actions={
              role && onOpenRole ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onOpenRole(role.id)}
                >
                  <ExternalLink className="size-4" /> {t("sheet.person.viewRoleProfile")}
                </Button>
              ) : null
            }
          >
            {!role ? (
              <p className="text-sm text-muted-foreground">
                {t("sheet.person.noRoleAssignedHint")}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-foreground">
                    {direction?.title ?? t("sheet.person.unknownDirection")}
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
                      <span>{t("sheet.person.roleCoverage")}</span>
                      <span className="tabular-nums">
                        {t("sheet.person.coverageGap").replace("{filled}", String(cov.filled)).replace("{target}", String(role.target_count)).replace("{gap}", String(cov.gap))}
                      </span>
                    </div>
                    <Progress
                      className="mt-2"
                      value={Math.min(100, (cov.filled / Math.max(1, role.target_count)) * 100)}
                    />
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{t("sheet.person.teammates")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {teammates.length === 0 && (
                      <span className="text-xs text-danger">{t("sheet.person.soleOwnerWarning")}</span>
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
            <Module collapsible defaultOpen={false} badge={String(skillMatch.length)} title={t("sheet.person.skillMatchTitle")}>
              {skillMatch.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("sheet.person.noSkillRequirements")}</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {t("sheet.person.skillSummary")
                      .replace("{total}", String(skillSummary.total))
                      .replace("{ok}", String(skillSummary.ok))
                      .replace("{minor}", String(skillSummary.minor))
                      .replace("{major}", String(skillSummary.major))
                      .replace("{none}", String(skillSummary.none))}
                  </p>
                  <ul className="space-y-2">
                    {skillMatch.map((s) => {
                      const tone =
                        s.state === "met"
                          ? "text-ok"
                          : s.state === "none"
                            ? "text-muted-foreground"
                            : s.state === "minor"
                              ? "text-warn"
                              : "text-danger";
                      const stateLabel =
                        s.state === "met"
                          ? t("sheet.person.gapMet")
                          : s.state === "minor"
                            ? t("sheet.person.gapMinor")
                            : s.state === "major"
                              ? t("sheet.person.gapMajor")
                              : t("sheet.person.gapNone");
                      return (
                        <li
                          key={s.skill}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            {s.skill}
                            {s.fuzzy && (
                              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {t("sheet.person.fuzzyMatch")}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-2 text-xs">
                            <LevelScale required={s.required} actual={s.actual} />
                            <span className={tone}>{stateLabel}</span>
                            {s.state === "met" ? (
                              <Check className="size-4 text-ok" />
                            ) : (
                              <AlertTriangle className={`size-4 ${tone}`} />
                            )}
                            <Select
                              value={s.actual ? String(s.actual) : "none"}
                              onValueChange={(v) =>
                                setSkillLevel.mutate({
                                  skill: s.skill,
                                  level: v === "none" ? null : v,
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t("sheet.person.gapNone")}</SelectItem>
                                {SKILL_LEVELS.map((lv) => (
                                  <SelectItem key={lv} value={lv}>
                                    {lv}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Module>
          )}

          {role && (
            <Module collapsible defaultOpen={false} title={t("sheet.person.carriedCapabilities")}>
              {carried.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("sheet.person.noRelatedCapabilities")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {carried
                      .filter((c) => c.tier !== "normal")
                      .map((c) => (
                        <span
                          key={`${c.kind}-${c.label}`}
                          className={`rounded-full border px-2.5 py-1 text-xs ${
                            c.tier === "critical"
                              ? "border-danger/50 bg-danger/10 text-danger"
                              : "border-warn/50 bg-warn/10 text-warn"
                          }`}
                          title={
                            c.tier === "critical"
                              ? t("sheet.person.suggestBackup")
                              : t("sheet.person.suggestShare")
                          }
                        >
                          {c.label} ·{" "}
                          {c.tier === "critical"
                            ? t("sheet.person.riskCritical")
                            : t("sheet.person.riskWatch")}
                        </span>
                      ))}
                  </div>
                  <CollapsedRest
                    items={carried.filter((c) => c.tier === "normal").map((c) => c.label)}
                    label={t("sheet.person.otherCarried")}
                  />
                </>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{t("sheet.person.riskFootnote")}</p>
            </Module>
          )}


          <Module collapsible defaultOpen={false} badge={String((fits.data ?? []).length)} title={t("sheet.person.aiFitRecordsTitle")}>
            {fits.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("sheet.loading")}</p>
            ) : (fits.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("sheet.person.noFitRecords")}
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
                          {r?.title ?? t("sheet.person.deletedRole")}
                        </button>
                        <span className="font-display text-sm tabular-nums text-brand">
                          {f.fit_score}
                        </span>
                      </div>
                      {f.summary && (
                        <p className="mt-1 text-xs text-muted-foreground">{f.summary}</p>
                      )}
                      {f.recommendation && (
                        <p className="mt-1 text-xs text-foreground/80">{t("sheet.person.recommendationLabel").replace("{text}", f.recommendation)}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Module>

          {(person.prior_experience ?? []).length > 0 && (
            <Module collapsible defaultOpen={false} title={t("sheet.person.priorExperienceTitle")}>
              <ul className="space-y-1.5 text-sm text-foreground/85">
                {(person.prior_experience ?? []).map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            </Module>
          )}

          {person.note && (
            <Module collapsible defaultOpen={false} title={t("sheet.person.noteTitle")}>
              <p className="text-sm text-foreground/85">{person.note}</p>
            </Module>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

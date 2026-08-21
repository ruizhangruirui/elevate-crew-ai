import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Pencil,
  ExternalLink,
  AlertTriangle,
  Check,
  ChevronRight,
  Plus,
  History,
  Trash2,
  Award,
  TrendingUp,
  LogOut,
} from "lucide-react";
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
import { fetchLifecycleEvents, recordJoin } from "@/lib/lifecycle";
import { ArchivePersonDialog } from "@/components/ArchivePersonDialog";
import { contractLabel } from "@/lib/contract";
import { effectiveImportance } from "@/lib/importance";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | undefined;
}) {
  const toneCls =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "";
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

export function PersonProfile({
  person,
  people,
  roles,
  directions,
  onDone,
  onOpenRole,
}: {
  person: Person;
  people: Person[];
  roles: Role[];
  directions: Direction[];
  onDone: () => void;
  onOpenRole?: (roleId: string) => void;
}) {
  const { t } = useI18n();
  const [editingHr, setEditingHr] = useState(false);
  const [editingMgr, setEditingMgr] = useState(false);
  const orgNodes = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });

  const role = person.role_id ? (roles.find((r) => r.id === person.role_id) ?? null) : null;
  const direction = role ? (directions.find((d) => d.id === role.direction_id) ?? null) : null;


  const perfRecords = useQuery({
    queryKey: ["person-perf", person.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_records")
        .select("*")
        .eq("person_id", person.id)
        .order("recorded_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const milestones = useQuery({
    queryKey: ["person-milestones", person.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("person_milestones")
        .select("*")
        .eq("person_id", person.id)
        .order("effective_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const history = useQuery({
    queryKey: ["person-audit", person.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("person_id", person.id)
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
        person_id: person.id,
        period: perfForm.period.trim() || new Date().getFullYear().toString(),
        rating: perfForm.rating,
        summary: perfForm.summary || null,
        highlights: perfForm.highlights || null,
        improvements: perfForm.improvements || null,
        reviewer: perfForm.reviewer || null,
      });
      if (error) throw error;
      await supabase.from("audit_log").insert({
        person_id: person.id,
        action: t("sheet.person.perfAddAction"),
        entity: person.name,
        detail: `${perfForm.period} · ${perfLabelOf(t, perfForm.rating)}`,
      });
    },
    onSuccess: () => {
      toast.success(t("sheet.person.perfSaved"));
      setPerfOpen(false);
      setPerfForm({
        period: "",
        rating: "meets",
        summary: "",
        highlights: "",
        improvements: "",
        reviewer: "",
      });
      perfRecords.refetch();
      history.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [msOpen, setMsOpen] = useState(false);
  const [msForm, setMsForm] = useState({
    kind: "award",
    title: "",
    detail: "",
    effective_on: new Date().toISOString().slice(0, 10),
    issuer: "",
    from_level: "",
    to_level: "",
  });

  const addMilestone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("person_milestones").insert({
        person_id: person.id,
        kind: msForm.kind,
        title: msForm.title.trim(),
        detail: msForm.detail || null,
        effective_on: msForm.effective_on,
        issuer: msForm.issuer || null,
        from_level: msForm.from_level ? Number(msForm.from_level) : null,
        to_level: msForm.to_level ? Number(msForm.to_level) : null,
      });
      if (error) throw error;
      await supabase.from("audit_log").insert({
        person_id: person.id,
        action: t("pp.ms.action"),
        entity: person.name,
        detail: `${t(`pp.ms.kind.${msForm.kind}`)} · ${msForm.title}`,
      });
    },
    onSuccess: () => {
      toast.success(t("pp.ms.saved"));
      setMsOpen(false);
      setMsForm({
        kind: "award",
        title: "",
        detail: "",
        effective_on: new Date().toISOString().slice(0, 10),
        issuer: "",
        from_level: "",
        to_level: "",
      });
      milestones.refetch();
      history.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("person_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("pp.ms.removed"));
      milestones.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const carried = useMemo(() => {
    if (!role) return [];
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

  const ownSkills = useMemo(
    () => ((person.assessed_skills ?? []) as Skill[]).filter((s) => !!s?.skill),
    [person],
  );
  const [skillOpen, setSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ skill: "", level: "Proficient" });


  const setSkillLevel = useMutation({
    mutationFn: async ({ skill, level }: { skill: string; level: string | null }) => {
      const own = [...((person.assessed_skills ?? []) as Skill[])];
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
        .eq("id", person.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        person_id: person.id,
        action: t("sheet.person.skillChangeAction"),
        entity: person.name,
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

  const teammates = role ? people.filter((p) => p.role_id === role.id && p.id !== person.id) : [];
  const cov = role ? coverageOf(role, people) : null;

  const [form, setForm] = useState({
    performance: "",
    tenure_months: "",
    contract_type: "unset",
    importance: "auto",
    is_leader: false,
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

  function resetForm() {
    setForm({
      performance: person.performance ?? "",
      tenure_months: person.tenure_months != null ? String(person.tenure_months) : "",
      contract_type: person.contract_type || "unset",
      importance: person.importance || "auto",
      is_leader: !!person.is_leader,
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
          importance: form.importance,
          is_leader: form.is_leader,
          tags: form.tags
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          readiness: form.readiness,
          attrition_risk: form.attrition_risk,
          prior_experience: form.prior_experience
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          assessed_skills: skills as unknown as never,
          note: form.note || null,
          role_id: form.role_id === "none" ? null : form.role_id,
          org_node_id: form.org_node_id === "none" ? null : form.org_node_id,
          level: form.level ? Number(form.level) : null,
          status: form.status,
          assessed_at: new Date().toISOString(),
        })
        .eq("id", person.id);
      if (error) throw error;

      if (person.status !== "onboard" && form.status === "onboard") {
        await recordJoin(person.id, { reason: "candidate_converted" });
      }

      const nextNode = form.org_node_id === "none" ? null : form.org_node_id;
      if (nextNode !== (person.org_node_id ?? null)) {
        const nameOf = (id: string | null) =>
          id
            ? ((orgNodes.data ?? []).find((n) => n.id === id)?.name ?? id)
            : t("sheet.person.unassigned");
        await supabase.from("audit_log").insert({
          person_id: person.id,
          action: t("sheet.person.orgMoveAction"),
          entity: t("sheet.person.orgMoveEntity").replace("{name}", person.name),
          detail: `${nameOf(person.org_node_id ?? null)} → ${nameOf(nextNode)}`,
        });
      }

      const diffs: string[] = [];
      const cmp = (label: string, before: string, after: string) => {
        if ((before || "—") !== (after || "—"))
          diffs.push(`${label}: ${before || "—"} → ${after || "—"}`);
      };
      cmp(
        t("sheet.person.performance"),
        perfLabelOf(t, person.performance ?? ""),
        perfLabelOf(t, form.performance),
      );
      cmp(t("sheet.person.level"), person.level != null ? String(person.level) : "", form.level);
      cmp(t("sheet.person.status"), person.status ?? "", form.status);
      cmp(
        t("sheet.person.readiness"),
        readinessLabelOf(t, person.readiness ?? "unknown"),
        readinessLabelOf(t, form.readiness),
      );
      cmp(
        t("sheet.person.attritionRisk"),
        riskLabelOf(t, person.attrition_risk ?? "unknown"),
        riskLabelOf(t, form.attrition_risk),
      );
      cmp(
        t("sheet.person.contractType"),
        person.contract_type ?? "",
        form.contract_type === "unset" ? "" : form.contract_type,
      );
      cmp(t("importance.label"), person.importance ?? "auto", form.importance);
      cmp(
        t("importance.isLeader"),
        person.is_leader ? t("common.yes") : t("common.no"),
        form.is_leader ? t("common.yes") : t("common.no"),
      );
      cmp(t("sheet.person.tags"), (person.tags ?? []).join(", "), form.tags);
      if (diffs.length > 0) {
        await supabase.from("audit_log").insert({
          person_id: person.id,
          action: t("sheet.person.profileUpdateAction"),
          entity: person.name,
          detail: diffs.join(" · "),
        });
      }
    },
    onSuccess: () => {
      toast.success(t("sheet.person.assessmentSaved"));
      setEditingHr(false);
      setEditingMgr(false);
      history.refetch();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBar = (
    <div className="flex gap-2">
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {t("sheet.save")}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setEditingHr(false);
          setEditingMgr(false);
        }}
      >
        {t("sheet.cancel")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Fact
          label={t("sheet.person.level")}
          value={person.level != null ? `Level ${person.level}` : "—"}
        />
        <Fact
          label={t("sheet.person.status")}
          value={
            person.status === "onboard" ? t("sheet.person.onboard") : t("sheet.person.candidate")
          }
          tone={person.status === "onboard" ? "ok" : "warn"}
        />
        <Fact
          label={t("sheet.person.performance")}
          value={perfLabelOf(t, person.performance ?? "") || t("sheet.person.notAssessed")}
        />
        <Fact
          label={t("sheet.person.contractType")}
          value={contractLabel(t, person.contract_type) || t("sheet.person.notFilled")}
        />
        <Fact
          label={t("importance.label")}
          value={`${t(`importance.${effectiveImportance(person, roles)}`)}${person.is_leader ? ` · ${t("importance.leaderBadge")}` : ""}`}
        />
        <Fact
          label={t("sheet.person.team")}
          value={
            (orgNodes.data ?? []).find((n) => n.id === person.org_node_id)?.name ??
            t("sheet.person.unassigned")
          }
          tone={person.org_node_id ? undefined : "warn"}
        />
        <Fact
          label={t("sheet.person.tenure")}
          value={
            person.tenure_months != null
              ? t("sheet.person.tenureMonths").replace("{n}", String(person.tenure_months))
              : "—"
          }
        />
        <Fact
          label={t("sheet.person.readiness")}
          value={readinessLabelOf(t, person.readiness ?? "unknown")}
          tone={person.readiness === "ready" ? "ok" : undefined}
        />
        <Fact
          label={t("sheet.person.attritionRisk")}
          value={riskLabelOf(t, person.attrition_risk ?? "unknown")}
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
          {(person.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs text-brand"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <Tabs defaultValue="hr">
        <TabsList>
          <TabsTrigger value="hr">{t("pp.tab.hr")}</TabsTrigger>
          <TabsTrigger value="manager">{t("pp.tab.manager")}</TabsTrigger>
        </TabsList>

        {/* ---------------- HR ---------------- */}
        <TabsContent value="hr" className="mt-5 space-y-5">
          <p className="text-xs text-muted-foreground">{t("pp.hr.hint")}</p>

          {!editingHr ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                resetForm();
                setEditingHr(true);
              }}
            >
              <Pencil className="size-4" /> {t("pp.hr.edit")}
            </Button>
          ) : (
            <Module title={t("pp.hr.editTitle")}>
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
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("sheet.person.assignedRole")}</Label>
                    <Select
                      value={form.role_id}
                      onValueChange={(v) => setForm({ ...form, role_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("sheet.person.notAssigned")}</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.title}
                          </SelectItem>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.person.contractType")}</Label>
                  <Select
                    value={form.contract_type}
                    onValueChange={(v) => setForm({ ...form, contract_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">{t("sheet.person.notFilled")}</SelectItem>
                      <SelectItem value="正式员工">{t("sheet.person.contractRegular")}</SelectItem>
                      <SelectItem value="外包">{t("sheet.person.contractOutsourced")}</SelectItem>
                      <SelectItem value="实习生">{t("sheet.person.contractIntern")}</SelectItem>
                      <SelectItem value="外部顾问">
                        {t("sheet.person.contractConsultant")}
                      </SelectItem>
                      <SelectItem value="访问学者">
                        {t("sheet.person.contractVisitingScholar")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("importance.label")}</Label>
                    <Select
                      value={form.importance}
                      onValueChange={(v) => setForm({ ...form, importance: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t("importance.auto")}</SelectItem>
                        <SelectItem value="core">{t("importance.core")}</SelectItem>
                        <SelectItem value="key">{t("importance.key")}</SelectItem>
                        <SelectItem value="standard">{t("importance.standard")}</SelectItem>
                        <SelectItem value="peripheral">{t("importance.peripheral")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{t("importance.autoHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("importance.isLeader")}</Label>
                    <Select
                      value={form.is_leader ? "yes" : "no"}
                      onValueChange={(v) => setForm({ ...form, is_leader: v === "yes" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">{t("common.no")}</SelectItem>
                        <SelectItem value="yes">{t("common.yes")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                {saveBar}
              </div>
            </Module>
          )}

          <Module
            title={t("pp.ms.title")}
            badge={String((milestones.data ?? []).length)}
            actions={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setMsOpen((v) => !v)}
              >
                <Plus className="size-4" /> {t("pp.ms.add")}
              </Button>
            }
          >
            {msOpen && (
              <div className="mb-4 space-y-3 rounded-lg border border-border/60 bg-surface-raised/40 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>{t("pp.ms.kind")}</Label>
                    <Select
                      value={msForm.kind}
                      onValueChange={(v) => setMsForm({ ...msForm, kind: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="promotion">{t("pp.ms.kind.promotion")}</SelectItem>
                        <SelectItem value="award">{t("pp.ms.kind.award")}</SelectItem>
                        <SelectItem value="certification">
                          {t("pp.ms.kind.certification")}
                        </SelectItem>
                        <SelectItem value="other">{t("pp.ms.kind.other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("pp.ms.date")}</Label>
                    <Input
                      type="date"
                      value={msForm.effective_on}
                      onChange={(e) => setMsForm({ ...msForm, effective_on: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("pp.ms.issuer")}</Label>
                    <Input
                      value={msForm.issuer}
                      onChange={(e) => setMsForm({ ...msForm, issuer: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("pp.ms.titleField")}</Label>
                  <Input
                    value={msForm.title}
                    onChange={(e) => setMsForm({ ...msForm, title: e.target.value })}
                  />
                </div>
                {msForm.kind === "promotion" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t("pp.ms.fromLevel")}</Label>
                      <Input
                        type="number"
                        value={msForm.from_level}
                        onChange={(e) => setMsForm({ ...msForm, from_level: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("pp.ms.toLevel")}</Label>
                      <Input
                        type="number"
                        value={msForm.to_level}
                        onChange={(e) => setMsForm({ ...msForm, to_level: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{t("pp.ms.detail")}</Label>
                  <Textarea
                    rows={2}
                    value={msForm.detail}
                    onChange={(e) => setMsForm({ ...msForm, detail: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => addMilestone.mutate()}
                    disabled={!msForm.title.trim() || addMilestone.isPending}
                  >
                    {t("sheet.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMsOpen(false)}>
                    {t("sheet.cancel")}
                  </Button>
                </div>
              </div>
            )}
            {milestones.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("sheet.loading")}</p>
            ) : (milestones.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("pp.ms.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {(milestones.data ?? []).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface-raised/40 p-3"
                  >
                    {m.kind === "promotion" ? (
                      <TrendingUp className="mt-0.5 size-4 shrink-0 text-brand" />
                    ) : (
                      <Award className="mt-0.5 size-4 shrink-0 text-brand" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-display text-sm font-semibold">
                        {m.title}
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {t(`pp.ms.kind.${m.kind}`)}
                        </span>
                        {m.from_level != null && m.to_level != null && (
                          <span className="rounded-full border border-ok/50 bg-ok/10 px-2 py-0.5 text-[10px] font-normal text-ok">
                            L{m.from_level} → L{m.to_level}
                          </span>
                        )}
                      </p>
                      {m.detail && <p className="mt-1 text-xs text-foreground/85">{m.detail}</p>}
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {m.effective_on}
                        {m.issuer ? ` · ${m.issuer}` : ""}
                      </p>
                    </div>
                    <ConfirmAction
                      title={t("pp.ms.removeTitle")}
                      description={<p>{t("pp.ms.removeDesc")}</p>}
                      confirmLabel={t("ppl.remove.confirmLabel")}
                      onConfirm={() => removeMilestone.mutate(m.id)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-danger"
                        aria-label={t("ppl.remove.label")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </ConfirmAction>
                  </li>
                ))}
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

          <Module
            collapsible
            defaultOpen={false}
            badge={String((history.data ?? []).length)}
            title={t("sheet.person.historyTitle")}
          >
            {history.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("sheet.loading")}</p>
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("sheet.person.noHistory")}</p>
            ) : (
              <ul className="space-y-2">
                {(history.data ?? []).map((h) => (
                  <li
                    key={h.id}
                    className="flex gap-2 rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2"
                  >
                    <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm">{h.action}</p>
                      {h.detail && <p className="text-xs text-muted-foreground">{h.detail}</p>}
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {new Date(h.created_at).toLocaleString()} · {h.actor}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Module>

          <LifecycleModule personId={person.id} personName={person.name} />
        </TabsContent>

        {/* ---------------- Manager ---------------- */}
        <TabsContent value="manager" className="mt-5 space-y-5">
          <p className="text-xs text-muted-foreground">{t("pp.mgr.hint")}</p>

          {!editingMgr ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                resetForm();
                setEditingMgr(true);
              }}
            >
              <Pencil className="size-4" /> {t("pp.mgr.edit")}
            </Button>
          ) : (
            <Module title={t("pp.mgr.editTitle")}>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("sheet.person.performance")}</Label>
                    <Select
                      value={form.performance || "unset"}
                      onValueChange={(v) =>
                        setForm({ ...form, performance: v === "unset" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t("sheet.person.notAssessed")}</SelectItem>
                        <SelectItem value="exceeds">
                          {t("sheet.person.exceedsExpectation")}
                        </SelectItem>
                        <SelectItem value="meets">{t("sheet.person.meetsExpectation")}</SelectItem>
                        <SelectItem value="below">{t("sheet.person.belowExpectation")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Readiness</Label>
                    <Select
                      value={form.readiness}
                      onValueChange={(v) => setForm({ ...form, readiness: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                  <Label>{t("sheet.person.assessedSkillsLabel")}</Label>
                  <Textarea
                    rows={4}
                    value={form.assessed_skills}
                    onChange={(e) => setForm({ ...form, assessed_skills: e.target.value })}
                    placeholder={"RTL Design | Expert\nNPU Architecture | Working"}
                  />
                </div>
                {saveBar}
              </div>
            </Module>
          )}

          <Module
            badge={String((perfRecords.data ?? []).length)}
            title={t("sheet.person.perfRecordTitle")}
            actions={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPerfOpen((v) => !v)}
              >
                <Plus className="size-4" /> {t("sheet.person.perfAdd")}
              </Button>
            }
          >
            {perfOpen && (
              <div className="mb-4 space-y-3 rounded-lg border border-border/60 bg-surface-raised/40 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>{t("sheet.person.perfPeriod")}</Label>
                    <Input
                      value={perfForm.period}
                      placeholder="2026 H1"
                      onChange={(e) => setPerfForm({ ...perfForm, period: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("sheet.person.perfRating")}</Label>
                    <Select
                      value={perfForm.rating}
                      onValueChange={(v) => setPerfForm({ ...perfForm, rating: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exceeds">
                          {t("sheet.person.exceedsExpectation")}
                        </SelectItem>
                        <SelectItem value="meets">{t("sheet.person.meetsExpectation")}</SelectItem>
                        <SelectItem value="below">{t("sheet.person.belowExpectation")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("sheet.person.perfReviewer")}</Label>
                    <Input
                      value={perfForm.reviewer}
                      onChange={(e) => setPerfForm({ ...perfForm, reviewer: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sheet.person.perfSummary")}</Label>
                  <Textarea
                    rows={2}
                    value={perfForm.summary}
                    onChange={(e) => setPerfForm({ ...perfForm, summary: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("sheet.person.perfHighlights")}</Label>
                    <Textarea
                      rows={2}
                      value={perfForm.highlights}
                      onChange={(e) => setPerfForm({ ...perfForm, highlights: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("sheet.person.perfImprovements")}</Label>
                    <Textarea
                      rows={2}
                      value={perfForm.improvements}
                      onChange={(e) => setPerfForm({ ...perfForm, improvements: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => addPerf.mutate()} disabled={addPerf.isPending}>
                    {t("sheet.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPerfOpen(false)}>
                    {t("sheet.cancel")}
                  </Button>
                </div>
              </div>
            )}
            {perfRecords.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("sheet.loading")}</p>
            ) : (perfRecords.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("sheet.person.noPerfRecords")}</p>
            ) : (
              <ul className="space-y-2">
                {(perfRecords.data ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border/60 bg-surface-raised/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-sm font-semibold">{r.period}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          r.rating === "exceeds"
                            ? "border-ok/50 bg-ok/10 text-ok"
                            : r.rating === "below"
                              ? "border-danger/50 bg-danger/10 text-danger"
                              : "border-border/70 text-muted-foreground"
                        }`}
                      >
                        {perfLabelOf(t, r.rating)}
                      </span>
                    </div>
                    {r.summary && <p className="mt-1 text-xs text-foreground/85">{r.summary}</p>}
                    {r.highlights && <p className="mt-1 text-xs text-ok">+ {r.highlights}</p>}
                    {r.improvements && <p className="mt-1 text-xs text-warn">△ {r.improvements}</p>}
                    <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                      {r.reviewer ? ` · ${r.reviewer}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Module>

          <Module
            badge={String(ownSkills.length)}
            title={t("pp.skill.title")}
            actions={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSkillOpen((v) => !v)}
              >
                <Plus className="size-4" /> {t("pp.skill.add")}
              </Button>
            }
          >
            <p className="mb-3 text-xs text-muted-foreground">{t("pp.skill.hint")}</p>
            {skillOpen && (
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-surface-raised/40 p-3">
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label>{t("pp.skill.name")}</Label>
                  <Input
                    value={newSkill.skill}
                    placeholder={t("pp.skill.namePlaceholder")}
                    onChange={(e) => setNewSkill({ ...newSkill, skill: e.target.value })}
                  />
                </div>
                <div className="w-40 space-y-1.5">
                  <Label>{t("pp.skill.level")}</Label>
                  <Select
                    value={newSkill.level}
                    onValueChange={(v) => setNewSkill({ ...newSkill, level: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_LEVELS.map((lv) => (
                        <SelectItem key={lv} value={lv}>
                          {lv}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!newSkill.skill.trim() || setSkillLevel.isPending}
                    onClick={() =>
                      setSkillLevel.mutate(
                        { skill: newSkill.skill.trim(), level: newSkill.level },
                        {
                          onSuccess: () => {
                            setNewSkill({ skill: "", level: "Proficient" });
                            setSkillOpen(false);
                          },
                        },
                      )
                    }
                  >
                    {t("sheet.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSkillOpen(false)}>
                    {t("sheet.cancel")}
                  </Button>
                </div>
              </div>
            )}
            {ownSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("pp.skill.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {ownSkills.map((s) => (
                  <li
                    key={s.skill}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2"
                  >
                    <span className="text-sm">{s.skill}</span>
                    <span className="flex items-center gap-2">
                      <Select
                        value={s.level ?? "Proficient"}
                        onValueChange={(v) =>
                          setSkillLevel.mutate({ skill: s.skill as string, level: v })
                        }
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SKILL_LEVELS.map((lv) => (
                            <SelectItem key={lv} value={lv}>
                              {lv}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <ConfirmAction
                        title={t("pp.skill.removeTitle")}
                        description={<p>{t("pp.skill.removeDesc")}</p>}
                        confirmLabel={t("ppl.remove.confirmLabel")}
                        onConfirm={() =>
                          setSkillLevel.mutate({ skill: s.skill as string, level: null })
                        }
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-danger"
                          aria-label={t("ppl.remove.label")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </ConfirmAction>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Module>

          {role && (
            <Module title={t("sheet.person.carriedCapabilities")}>
              {carried.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("sheet.person.noRelatedCapabilities")}
                </p>
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

          {null}

        </TabsContent>
      </Tabs>
    </div>
  );
}

function LifecycleModule({ personId, personName }: { personId: string; personName: string }) {
  const { t } = useI18n();
  const { data: events } = useQuery({ queryKey: ["lifecycle"], queryFn: fetchLifecycleEvents });
  const mine = (events ?? []).filter((e) => e.person_id === personId);

  return (
    <Module
      title={t("lc.person.title")}
      collapsible
      defaultOpen={false}
      badge={String(mine.length)}
      actions={
        <ArchivePersonDialog personId={personId} personName={personName}>
          <Button variant="outline" size="sm" className="gap-1.5 text-danger">
            <LogOut className="size-3.5" /> {t("lc.archive.action")}
          </Button>
        </ArchivePersonDialog>
      }
    >
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("lc.person.empty")}</p>
      ) : (
        <ul className="space-y-2.5">
          {mine.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  e.event_type === "exit" ? "bg-danger/12 text-danger" : "bg-ok/12 text-ok"
                }`}
              >
                {e.event_type === "exit" ? t("lc.flow.eventExit") : t("lc.flow.eventJoin")}
              </span>
              <div className="min-w-0">
                <p className="text-sm">
                  {e.effective_on} · {t(`lc.reason.${e.reason ?? "other"}`)}
                </p>
                {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Module>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Pencil,
  ExternalLink,
  ChevronRight,
  Plus,
  History,
  Trash2,
  Award,
  TrendingUp,
  LogOut,
} from "lucide-react";
import { db as supabase } from "@/lib/db-client";
import {
  coverageOf,
  criticalityLabel,
  type Direction,
  type Person,
  type Role,
  type Skill,
} from "@/lib/talent";
import { buildCapabilities, normalizeKey, carrierRiskTier } from "@/lib/capability";
import { fetchOrgNodes } from "@/lib/org-tree";
import { useI18n } from "@/lib/i18n";
import { recordJoin } from "@/lib/lifecycle";
import { ArchivePersonDialog } from "@/components/ArchivePersonDialog";
import { useAuth } from "@/hooks/useAuth";
import { contractLabel, CONTRACTS, labTeamOf, tenureLabel, tenureMonths } from "@/lib/contract";
import { badgeImportance } from "@/lib/importance";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrowthSummary } from "@/components/GrowthSummary";
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
    <div className="min-w-0 border-b border-border/50 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 break-words text-sm font-medium ${toneCls}`}>{value}</p>
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
    <section className="border-b border-border/60 py-3">
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
      {shown && <div className="mt-3">{children}</div>}
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
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const canHr = user?.role === "owner" || user?.role === "hr";
  const canMgr = user?.role === "owner" || user?.role === "manager";
  const nodes = orgNodes.data ?? [];
  const { lab, team } = labTeamOf(nodes, person.org_node_id);
  const tenure = person.hire_date ? tenureMonths(person.hire_date) : (person.tenure_months ?? null);

  const [editing, setEditing] = useState<"basic" | "career" | null>(null);
  const [form, setForm] = useState({
    staff_id: "",
    name: "",
    org_node_id: "none",
    contract_type: "unset",
    hire_date: "",
    level: "",
    role_id: "none",
    offer_title: "",
    status: "onboard",
    tags: "",
    note: "",
    importance: "auto",
    is_leader: false,
    readiness: "unknown",
    attrition_risk: "unknown",
  });

  function startEdit(section: "basic" | "career") {
    setForm({
      staff_id: person.staff_id ?? "",
      name: person.name,
      org_node_id: person.org_node_id ?? "none",
      contract_type: person.contract_type || "unset",
      hire_date: person.hire_date ?? "",
      level: person.level != null ? String(person.level) : "",
      role_id: person.role_id ?? "none",
      offer_title: person.offer_title ?? "",
      status: person.status ?? "onboard",
      tags: (person.tags ?? []).join(", "),
      note: person.note ?? "",
      importance: person.importance || "auto",
      is_leader: !!person.is_leader,
      readiness: person.readiness ?? "unknown",
      attrition_risk: person.attrition_risk ?? "unknown",
    });
    setEditing(section);
  }

  const nodeName = (id: string | null) =>
    id ? (nodes.find((n) => n.id === id)?.name ?? id) : t("sheet.person.unassigned");

  const save = useMutation({
    mutationFn: async () => {
      const diffs: string[] = [];
      const cmp = (label: string, before: string, after: string) => {
        if ((before || "—") !== (after || "—")) diffs.push(`${label}: ${before || "—"} → ${after || "—"}`);
      };
      let payload: Record<string, unknown>;
      if (editing === "basic") {
        if (!form.name.trim()) throw new Error(t("pp.err.name"));
        const contract = form.contract_type === "unset" ? null : form.contract_type;
        const nextNode = form.org_node_id === "none" ? null : form.org_node_id;
        payload = {
          staff_id: form.staff_id.trim() || null,
          name: form.name.trim(),
          org_node_id: nextNode,
          contract_type: contract,
          hire_date: form.hire_date || null,
          level: form.level ? Number(form.level) : null,
          role_id: form.role_id === "none" ? null : form.role_id,
          offer_title: form.offer_title.trim() || null,
          status: form.status,
          tags: form.tags.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean),
          note: form.note || null,
        };
        cmp(t("pp.f.staffId"), person.staff_id ?? "", form.staff_id.trim());
        cmp(t("ppl.field.name"), person.name, form.name.trim());
        cmp(t("sheet.person.team"), nodeName(person.org_node_id ?? null), nodeName(nextNode));
        cmp(t("sheet.person.contractType"), contractLabel(t, person.contract_type) ?? "", contractLabel(t, contract) ?? "");
        cmp(t("pp.f.hireDate"), person.hire_date ?? "", form.hire_date);
        cmp(t("sheet.person.level"), person.level != null ? String(person.level) : "", form.level);
        cmp(t("pp.f.role"), roles.find((r) => r.id === person.role_id)?.title ?? "", roles.find((r) => r.id === form.role_id)?.title ?? "");
        cmp(t("pp.f.offerTitle"), person.offer_title ?? "", form.offer_title.trim());
        cmp(t("sheet.person.status"), person.status ?? "", form.status);
        cmp(t("sheet.person.tags"), (person.tags ?? []).join(", "), form.tags);
      } else {
        payload = {
          importance: form.importance,
          is_leader: form.is_leader,
          readiness: form.readiness,
          attrition_risk: form.attrition_risk,
        };
        cmp(t("importance.label"), person.importance ?? "auto", form.importance);
        cmp(t("importance.isLeader"), person.is_leader ? t("common.yes") : t("common.no"), form.is_leader ? t("common.yes") : t("common.no"));
        cmp(t("sheet.person.readiness"), readinessLabelOf(t, person.readiness ?? "unknown"), readinessLabelOf(t, form.readiness));
        cmp(t("sheet.person.attritionRisk"), riskLabelOf(t, person.attrition_risk ?? "unknown"), riskLabelOf(t, form.attrition_risk));
      }
      const { error } = await supabase.from("people").update(payload as never).eq("id", person.id);
      if (error) throw error;
      if (editing === "basic" && person.status !== "onboard" && form.status === "onboard") {
        await recordJoin(person.id, { reason: "candidate_converted" });
      }
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
      setEditing(null);
      history.refetch();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBar = (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        {t("sheet.save")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
        {t("sheet.cancel")}
      </Button>
    </div>
  );

  const sel = (value: string, onChange: (v: string) => void, items: [string, string][]) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const yearly = (perfRecords.data ?? []) as any[];
  const imp = badgeImportance(person, roles);

  return (
    <div className="space-y-5">
      {/* ---------- Basic info (HR) ---------- */}
      <section className="card-glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold">{t("pp.basic.title")}</h3>
            <span className="text-[11px] text-muted-foreground">{t("pp.editedBy.hr")}</span>
          </div>
          <div className="flex items-center gap-1">
            {canHr && editing !== "basic" && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => startEdit("basic")}>
                <Pencil className="size-3.5" /> {t("pp.hr.edit")}
              </Button>
            )}
          </div>
        </div>

        {editing === "basic" ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("pp.f.staffId")}</Label>
                <Input value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("ppl.field.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("pp.f.labTeam")}</Label>
                {sel(form.org_node_id, (v) => setForm({ ...form, org_node_id: v }), [
                  ["none", t("sheet.person.unassigned")],
                  ...nodes
                    .filter((n) => n.type === "Lab" || n.type === "Team")
                    .map((n) => {
                      const l = labTeamOf(nodes, n.id).lab;
                      return [n.id, n.type === "Lab" ? n.name : `${l?.name ?? ""} / ${n.name}`] as [string, string];
                    }),
                ])}
              </div>
              <div className="space-y-1.5">
                <Label>{t("sheet.person.contractType")}</Label>
                {sel(form.contract_type, (v) => setForm({ ...form, contract_type: v }), [
                  ["unset", t("sheet.person.notFilled")],
                  ...CONTRACTS.map((c) => [c, contractLabel(t, c) ?? c] as [string, string]),
                ])}
              </div>
              <div className="space-y-1.5">
                <Label>{t("pp.f.hireDate")}</Label>
                <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("sheet.person.level")}</Label>
                <Input type="number" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("pp.f.role")}</Label>
                {sel(form.role_id, (v) => setForm({ ...form, role_id: v }), [
                  ["none", t("sheet.person.notAssigned")],
                  ...roles.map((r) => [r.id, r.title] as [string, string]),
                ])}
              </div>
              <div className="space-y-1.5">
                <Label>{t("pp.f.offerTitle")}</Label>
                <Input value={form.offer_title} onChange={(e) => setForm({ ...form, offer_title: e.target.value })} placeholder={t("pp.f.offerTitlePh")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("sheet.person.status")}</Label>
                {sel(form.status, (v) => setForm({ ...form, status: v }), [
                  ["onboard", t("sheet.person.onboard")],
                  ["candidate", t("sheet.person.candidate")],
                ])}
              </div>
              <div className="space-y-1.5">
                <Label>{t("sheet.person.tagsLabel")}</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={t("sheet.person.tagsPlaceholder")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("sheet.person.noteLabel")}</Label>
              <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            {saveBar}
          </div>
        ) : (
          <>
            <div className="mt-1 grid grid-cols-2 gap-x-5 sm:grid-cols-3 lg:grid-cols-5">
              <Fact label={t("pp.f.staffId")} value={person.staff_id || "—"} />
              <Fact label={t("ppl.field.name")} value={person.name} />
              <Fact label={t("pp.f.lab")} value={lab?.name ?? "—"} tone={lab ? undefined : "warn"} />
              <Fact label={t("sheet.person.team")} value={team?.name ?? "—"} />
              <Fact label={t("sheet.person.contractType")} value={contractLabel(t, person.contract_type) || "—"} />
              <Fact label={t("pp.f.hireDate")} value={person.hire_date ?? "—"} />
              <Fact label={t("sheet.person.level")} value={person.level != null ? `L${person.level}` : "—"} />
              <Fact label={t("pp.f.role")} value={role?.title ?? t("sheet.person.notAssigned")} />
              <Fact label={t("pp.f.offerTitle")} value={person.offer_title || "—"} />
              <Fact label={t("sheet.person.tenure")} value={tenureLabel(t, tenure)} />
              <Fact
                label={t("sheet.person.status")}
                value={person.status === "onboard" ? t("sheet.person.onboard") : t("sheet.person.candidate")}
                tone={person.status === "onboard" ? "ok" : "warn"}
              />
            </div>
            {(person.tags ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(person.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs text-brand">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {person.note && <p className="mt-2 text-xs text-muted-foreground">{person.note}</p>}
          </>
        )}
        {canHr && editing !== "basic" && (
          <div className="mt-4 flex items-center justify-end border-t border-border/40 pt-2.5">
            <ArchivePersonDialog personId={person.id} personName={person.name} onDone={() => navigate({ to: "/people" })}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-danger">
                <LogOut className="size-3.5" /> {t("lc.archive.action")}
              </Button>
            </ArchivePersonDialog>
          </div>
        )}
      </section>

      <div className="grid gap-5">
        {/* ---------- Career Profile (HR) ---------- */}
        <div className="card-glass px-5 pb-2 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold">{t("pp.career.title")}</h2>
              <span className="text-[11px] text-muted-foreground">{t("pp.editedBy.hr")}</span>
            </div>
            {canHr && editing !== "career" && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => startEdit("career")}>
                <Pencil className="size-3.5" /> {t("pp.career.edit")}
              </Button>
            )}
          </div>

          <Module
            title={t("pp.career.duties")}
            actions={
              role && onOpenRole ? (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onOpenRole(role.id)}>
                  <ExternalLink className="size-3.5" /> {t("sheet.person.viewRoleProfile")}
                </Button>
              ) : null
            }
          >
            {!role ? (
              <p className="text-sm text-muted-foreground">{t("sheet.person.noRoleAssignedHint")}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {role.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {direction?.title ?? ""} · {criticalityLabel[role.criticality] ?? role.criticality}
                  </span>
                </p>
                <p className="whitespace-pre-line text-sm text-foreground/85">
                  {role.description || role.kpa || t("pp.career.noDuties")}
                </p>
              </div>
            )}
          </Module>

          {editing === "career" ? (
            <div className="space-y-3 border-b border-border/60 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("importance.label")}</Label>
                  {sel(form.importance, (v) => setForm({ ...form, importance: v }), [
                    ["auto", t("importance.auto")],
                    ["core", t("importance.core")],
                    ["key", t("importance.key")],
                    ["standard", t("importance.none")],
                  ])}
                </div>
                <div className="space-y-1.5">
                  <Label>{t("importance.isLeader")}</Label>
                  {sel(form.is_leader ? "yes" : "no", (v) => setForm({ ...form, is_leader: v === "yes" }), [
                    ["no", t("common.no")],
                    ["yes", t("common.yes")],
                  ])}
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sheet.person.attritionRisk")}</Label>
                  {sel(form.attrition_risk, (v) => setForm({ ...form, attrition_risk: v }), [
                    ["unknown", t("sheet.person.notAssessed")],
                    ["low", t("sheet.person.riskLow")],
                    ["medium", t("sheet.person.riskMedium")],
                    ["high", t("sheet.person.riskHigh")],
                  ])}
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sheet.person.readiness")}</Label>
                  {sel(form.readiness, (v) => setForm({ ...form, readiness: v }), [
                    ["unknown", t("sheet.person.notAssessed")],
                    ["ready", t("sheet.person.readyNow")],
                    ["ready_1y", t("sheet.person.ready1y")],
                    ["ready_2y", t("sheet.person.ready2y")],
                  ])}
                </div>
              </div>
              {saveBar}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-4 border-b border-border/60 pb-2">
              <Fact
                label={t("importance.label")}
                value={[imp ? t(`importance.${imp}`) : t("importance.none"), person.is_leader ? t("importance.leaderBadge") : null].filter(Boolean).join(" · ")}
              />
              <Fact
                label={t("sheet.person.attritionRisk")}
                value={riskLabelOf(t, person.attrition_risk ?? "unknown")}
                tone={person.attrition_risk === "high" ? "danger" : person.attrition_risk === "medium" ? "warn" : undefined}
              />
              <Fact
                label={t("sheet.person.readiness")}
                value={readinessLabelOf(t, person.readiness ?? "unknown")}
                tone={person.readiness === "ready" ? "ok" : undefined}
              />
            </div>
          )}

          <Module title={t("pp.career.yearly")} badge={String(yearly.length)}>
            {yearly.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("sheet.person.noPerfRecords")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {yearly.map((r) => (
                  <span
                    key={r.id}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      r.rating === "exceeds"
                        ? "border-ok/50 bg-ok/10 text-ok"
                        : r.rating === "below"
                          ? "border-danger/50 bg-danger/10 text-danger"
                          : "border-border/70 text-muted-foreground"
                    }`}
                  >
                    {r.period} · {perfLabelOf(t, r.rating)}
                  </span>
                ))}
              </div>
            )}
          </Module>

          <Module
            title={t("pp.ms.title")}
            badge={String((milestones.data ?? []).length)}
            actions={
              canHr && <Button
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
                {(milestones.data ?? []).map((m: any) => (
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
                    {canHr && <ConfirmAction
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
                    </ConfirmAction>}
                  </li>
                ))}
              </ul>
            )}
          </Module>

        </div>

        {/* ---------- Manager assessment ---------- */}
        <div className="card-glass px-5 pb-2 pt-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2">
            <h2 className="font-display text-lg font-semibold">{t("pp.tab.manager")}</h2>
            <span className="text-[11px] text-muted-foreground">{t("pp.editedBy.mgr")}</span>
          </div>
          <Module
            badge={String((perfRecords.data ?? []).length)}
            title={t("sheet.person.perfRecordTitle")}
            actions={
              canMgr && <Button
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
                {(perfRecords.data ?? []).map((r: any) => (
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
              canMgr && <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSkillOpen((v) => !v)}
              >
                <Plus className="size-4" /> {t("pp.skill.add")}
              </Button>
            }
          >
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
                    {!canMgr ? <span className="text-xs text-muted-foreground">{s.level}</span> : <span className="flex items-center gap-2">
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
                    </span>}
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
            </Module>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card px-4">
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
                {(history.data ?? []).map((h: any) => (
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

      </div>
    </div>
  );
}


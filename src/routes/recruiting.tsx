import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ExternalLink, FileText, Linkedin, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { RoleMenu } from "@/routes/index";
import { fetchOrgNodes } from "@/lib/org-tree";
import { toastUndoable } from "@/lib/ui-feedback";
import { db } from "@/lib/db-client";
import { coverageOf, fetchWorkspace } from "@/lib/talent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/recruiting")({
  validateSearch: z.object({ role: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Recruiting · Talent Management" },
      { name: "description", content: "Track sourcing pipelines and candidates for open strategic roles." },
      { property: "og:title", content: "Recruiting · Talent Management" },
      { property: "og:description", content: "Track sourcing pipelines and candidates for open strategic roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => {
    const { t } = useI18n();
    return (
      <AppShell title={t("rec.title")}>
        <RecruitingBody />
      </AppShell>
    );
  },
});

const DEFAULT_STAGES = ["CV Screen", "Phone Interview", "Hiring Manager Interview", "Technical Interview", "Final Interview", "Reference Check", "Offer"];
const OUTCOMES = ["active", "on_hold", "offer", "to_onboard", "hired", "rejected", "withdrawn"] as const;
const FILTERS = {
  active: ["active", "on_hold", "offer"],
  to_onboard: ["to_onboard"],
  hired: ["hired"],
  closed: ["rejected", "withdrawn"],
  all: [...OUTCOMES],
} as const;
type FilterKey = keyof typeof FILTERS;

const OUTCOME_TONE: Record<string, string> = {
  active: "bg-brand/12 text-brand",
  on_hold: "bg-muted text-muted-foreground",
  offer: "bg-warn/12 text-warn",
  to_onboard: "bg-ok/12 text-ok",
  hired: "bg-ok/20 text-ok",
  rejected: "bg-danger/10 text-danger",
  withdrawn: "bg-danger/10 text-danger",
};

const CONTRACT_TYPE_EMPLOYEE = "Employee";
const CONTRACT_TYPE_LEASED = "Leased Employee";
const CONTRACT_TYPES = [CONTRACT_TYPE_EMPLOYEE, CONTRACT_TYPE_LEASED] as const;
function ctLabel(t: (k: string) => string, v: string | null): string {
  if (!v) return "—";
  return (CONTRACT_TYPES as readonly string[]).includes(v) ? t(`rec.ct.${v}`) : v;
}

export type Candidate = {
  id: string;
  role_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_company: string | null;
  current_title: string | null;
  location: string | null;
  source: string | null;
  cv_url: string | null;
  linkedin_url: string | null;
  stage: string | null;
  outcome: string;
  rating: number | null;
  recruiter: string | null;
  next_step: string | null;
  next_step_on: string | null;
  notes: string | null;
  contract_type: string | null;
  person_id: string | null;
  updated_at: string;
};

type CandidateEvent = {
  id: string;
  candidate_id: string;
  kind: string;
  stage: string | null;
  outcome: string | null;
  interviewer: string | null;
  note: string | null;
  happened_on: string;
  actor: string | null;
  created_at: string;
};

function safeUrl(u: string | null) {
  if (!u) return null;
  const v = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    return new URL(v).toString();
  } catch {
    return null;
  }
}

function RecruitingBody() {
  const { t } = useI18n();
  const { canManageStructure: canEdit } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/recruiting" });
  const { role: roleId } = Route.useSearch();
  const [openOnly, setOpenOnly] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Candidate | "new" | null>(null);

  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: orgNodes = [] } = useQuery({ queryKey: ["orgNodes"], queryFn: fetchOrgNodes });
  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("roles").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      if (roleId === id) {
        setEditing(null);
        navigate({ search: {} });
      }
      qc.invalidateQueries({ refetchType: "all" });
      toastUndoable(t("rec.roleRemoved"), t("ui.undo"), async () => {
        const { error } = await db.from("roles").update({ archived: false }).eq("id", id);
        if (error) { toast.error(error.message); return; }
        qc.invalidateQueries({ refetchType: "all" });
        navigate({ search: { role: id } });
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const { data: stageItems } = useQuery({
    queryKey: ["config", "candidateStages"],
    queryFn: async () => {
      const { data, error } = await db.from("config_items").select("name,active,sort_order").eq("category", "candidateStages").order("sort_order");
      if (error) throw error;
      return (data ?? []) as { name: string; active: boolean }[];
    },
  });
  const stages = stageItems && stageItems.length ? stageItems.filter((s) => s.active).map((s) => s.name) : DEFAULT_STAGES;

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await db.from("candidates").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const roles = ws?.roles ?? [];
  const people = ws?.people ?? [];
  const activeByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates ?? []) if ((FILTERS.active as readonly string[]).includes(c.outcome)) m.set(c.role_id, (m.get(c.role_id) ?? 0) + 1);
    return m;
  }, [candidates]);

  const roleList = roles
    .map((r) => ({ r, cov: coverageOf(r, people) }))
    .filter(({ r, cov }) => !openOnly || cov.gap > 0 || r.id === roleId || activeByRole.has(r.id));
  const role = roles.find((r) => r.id === roleId) ?? null;

  const rows = (candidates ?? [])
    .filter((c) => c.role_id === roleId)
    .filter((c) => (FILTERS[filter] as readonly string[]).includes(c.outcome))
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return [c.name, c.current_company, c.current_title, c.source, c.recruiter, c.stage].some((v) => v?.toLowerCase().includes(q));
    });
  const countFor = (k: FilterKey) => (candidates ?? []).filter((c) => c.role_id === roleId && (FILTERS[k] as readonly string[]).includes(c.outcome)).length;

  const quickUpdate = useMutation({
    mutationFn: async ({ c, patch }: { c: Candidate; patch: Partial<Candidate> }) => {
      const { error } = await db.from("candidates").update(patch).eq("id", c.id);
      if (error) throw error;
      await db.from("candidate_events").insert({
        candidate_id: c.id,
        kind: patch.stage !== undefined ? "stage" : "outcome",
        stage: patch.stage ?? null,
        outcome: patch.outcome ?? null,
      });
    },
    onSuccess: () => {
      toast.success(t("rec.saved"));
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["candidate-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ws) return <div className="text-sm text-muted-foreground">…</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="card-glass h-fit p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-display text-sm font-semibold">{t("rec.roles")}</h2>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            {t("rec.openOnly")}
          </label>
        </div>
        <ul className="space-y-1">
          {roleList.map(({ r, cov }) => (
            <li key={r.id} className="group relative">
              <Button
                variant="ghost"
                onClick={() => navigate({ search: { role: r.id } })}
                className={`h-auto w-full flex-col items-start gap-0 rounded-lg px-2.5 py-2 ${canEdit ? "pr-10" : ""} text-left text-sm whitespace-normal transition-colors ${r.id === roleId ? "bg-brand/12 text-foreground" : "hover:bg-surface-raised/60"}`}
              >
                <p className="w-full truncate font-medium">{r.title}</p>
                <p className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
                  <span className={cov.gap ? "text-danger" : "text-ok"}>
                    {cov.gap ? t("rec.gap").replace("{n}", String(cov.gap)) : t("rec.full")}
                  </span>
                  {activeByRole.get(r.id) ? <span>{t("rec.active").replace("{n}", String(activeByRole.get(r.id)))}</span> : null}
                </p>
              </Button>
              {canEdit && <RoleMenu
                role={r}
                orgNodes={orgNodes}
                onArchive={() => removeRole.mutate(r.id)}
                onSaved={() => qc.invalidateQueries({ refetchType: "all" })}
                removalLabel={t("rec.removeRole")}
                removalDescription={t("rec.removeRoleDesc").replace("{n}", String((candidates ?? []).filter((c) => c.role_id === r.id).length))}
              />}
            </li>
          ))}
        </ul>
      </aside>

      <section className="card-glass min-w-0 overflow-hidden">
        {!role ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">{t("rec.pickRole")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{role.title}</h2>
                <p className="text-xs text-muted-foreground">
                  Level {role.level_min}–{role.level_max} · {coverageOf(role, people).filled}/{role.target_count}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("rec.search")} className="h-9 w-56 pl-8 text-sm" />
                </div>
                {canEdit && (
                  <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
                    <Plus className="size-4" /> {t("rec.add")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-border/60 px-5 py-2">
              {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`rounded-md px-2.5 py-1 text-xs ${filter === k ? "bg-brand/12 font-medium text-brand" : "text-muted-foreground hover:bg-surface-raised/60"}`}
                >
                  {t(`rec.f.${k}`)} <span className="tabular-nums opacity-70">{countFor(k)}</span>
                </button>
              ))}
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-10 bg-background/95 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="w-8 px-3 py-2">#</th>
                    <th className="px-3 py-2">{t("rec.c.name")}</th>
                    <th className="px-3 py-2">{t("rec.c.current")}</th>
                    <th className="px-3 py-2">{t("rec.c.source")}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{t("rec.c.contract")}</th>
                    <th className="px-3 py-2">{t("rec.c.stage")}</th>
                    <th className="px-3 py-2">{t("rec.c.outcome")}</th>
                    <th className="px-3 py-2">{t("rec.c.next")}</th>
                    <th className="px-3 py-2">{t("rec.c.links")}</th>
                    <th className="px-3 py-2">{t("rec.c.recruiter")}</th>
                    <th className="px-3 py-2">{t("rec.c.updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c, i) => {
                    const cv = safeUrl(c.cv_url);
                    const li = safeUrl(c.linkedin_url);
                    return (
                      <tr key={c.id} className="border-t border-border/40 hover:bg-surface-raised/40">
                        <td className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <button type="button" className="text-left font-medium hover:text-brand" onClick={() => setEditing(c)}>
                            {c.name}
                          </button>
                          {c.person_id && (
                            <Link to="/people/$personId" params={{ personId: c.person_id }} className="ml-1.5 inline-flex align-middle text-ok" title={t("rec.linkedPerson")}>
                              <UserCheck className="size-3.5" />
                            </Link>
                          )}
                        </td>
                        <td className="max-w-48 truncate px-3 py-1.5 text-xs text-muted-foreground">
                          {[c.current_company, c.current_title].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{c.source || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{ctLabel(t, c.contract_type)}</td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={c.stage ?? ""}
                            disabled={!canEdit}
                            onValueChange={(v) => quickUpdate.mutate({ c, patch: { stage: v } })}
                          >
                            <SelectTrigger className="h-7 w-44 text-xs">
                              <SelectValue placeholder={t("rec.stageNone")} />
                            </SelectTrigger>
                            <SelectContent>
                              {[...new Set([...stages, ...(c.stage ? [c.stage] : [])])].map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={c.outcome}
                            disabled={!canEdit}
                            onValueChange={(v) => {
                              if (v === "to_onboard") setEditing(c);
                              else quickUpdate.mutate({ c, patch: { outcome: v } });
                            }}
                          >
                            <SelectTrigger className={`h-7 w-32 border-0 text-xs ${OUTCOME_TONE[c.outcome] ?? ""}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OUTCOMES.map((o) => (
                                <SelectItem key={o} value={o}>{t(`rec.out.${o}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="max-w-48 px-3 py-1.5 text-xs">
                          <p className="truncate">{c.next_step || "—"}</p>
                          {c.next_step_on && <p className="text-muted-foreground">{c.next_step_on}</p>}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="flex gap-1.5 text-muted-foreground">
                            {cv && <a href={cv} target="_blank" rel="noopener noreferrer" className="hover:text-brand" title="CV"><FileText className="size-4" /></a>}
                            {li && <a href={li} target="_blank" rel="noopener noreferrer" className="hover:text-brand" title="LinkedIn"><Linkedin className="size-4" /></a>}
                            {!cv && !li && "—"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{c.recruiter || "—"}</td>
                        <td className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{c.updated_at.slice(0, 10)}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-sm text-muted-foreground">{t("rec.empty")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {editing && role && (
        <CandidateDialog
          key={editing === "new" ? "new" : editing.id}
          candidate={editing === "new" ? null : editing}
          roleId={role.id}
          orgId={ws.org?.id ?? null}
          stages={stages}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CandidateDialog({
  candidate,
  roleId,
  orgId,
  stages,
  canEdit,
  onClose,
}: {
  candidate: Candidate | null;
  roleId: string;
  orgId: string | null;
  stages: string[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: candidate?.name ?? "",
    email: candidate?.email ?? "",
    phone: candidate?.phone ?? "",
    current_company: candidate?.current_company ?? "",
    current_title: candidate?.current_title ?? "",
    location: candidate?.location ?? "",
    source: candidate?.source ?? "",
    cv_url: candidate?.cv_url ?? "",
    linkedin_url: candidate?.linkedin_url ?? "",
    stage: candidate?.stage ?? stages[0] ?? "",
    outcome: candidate?.outcome ?? "active",
    rating: candidate?.rating ? String(candidate.rating) : "",
    recruiter: candidate?.recruiter ?? "",
    next_step: candidate?.next_step ?? "",
    next_step_on: candidate?.next_step_on ?? "",
    notes: candidate?.notes ?? "",
    contract_type: candidate?.contract_type ?? "",
  });
  const [ev, setEv] = useState({ note: "", interviewer: "", happened_on: new Date().toISOString().slice(0, 10) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const { data: events } = useQuery({
    queryKey: ["candidate-events", candidate?.id],
    enabled: !!candidate,
    queryFn: async () => {
      const { data, error } = await db.from("candidate_events").select("*").eq("candidate_id", candidate!.id).order("happened_on", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CandidateEvent[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["candidates"] });
    qc.invalidateQueries({ queryKey: ["candidate-events"] });
  };

  const payload = () => {
    const n = (v: string) => (v.trim() ? v.trim() : null);
    const rating = Number(f.rating);
    return {
      name: f.name.trim(),
      email: n(f.email),
      phone: n(f.phone),
      current_company: n(f.current_company),
      current_title: n(f.current_title),
      location: n(f.location),
      source: n(f.source),
      cv_url: n(f.cv_url),
      linkedin_url: n(f.linkedin_url),
      stage: n(f.stage),
      outcome: f.outcome,
      rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
      recruiter: n(f.recruiter),
      next_step: n(f.next_step),
      next_step_on: n(f.next_step_on),
      notes: n(f.notes),
      contract_type: n(f.contract_type),
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const p = payload();
      if (!candidate) {
        const { data, error } = await db.from("candidates").insert({ ...p, role_id: roleId }).select("id").single();
        if (error) throw error;
        await db.from("candidate_events").insert({ candidate_id: data.id, kind: "created", stage: p.stage, outcome: p.outcome });
        return;
      }
      const { error } = await db.from("candidates").update(p).eq("id", candidate.id);
      if (error) throw error;
      const changes: Record<string, unknown>[] = [];
      if (p.stage !== candidate.stage) changes.push({ candidate_id: candidate.id, kind: "stage", stage: p.stage });
      if (p.outcome !== candidate.outcome) changes.push({ candidate_id: candidate.id, kind: "outcome", outcome: p.outcome });
      if (changes.length) await db.from("candidate_events").insert(changes);
    },
    onSuccess: () => {
      toast.success(t("rec.saved"));
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addEvent = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("candidate_events").insert({
        candidate_id: candidate!.id,
        kind: "note",
        stage: f.stage || null,
        interviewer: ev.interviewer.trim() || null,
        note: ev.note.trim(),
        happened_on: ev.happened_on,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEv({ ...ev, note: "", interviewer: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toOnboard = useMutation({
    mutationFn: async () => {
      if (!candidate) return;
      if (!orgId) throw new Error("Organization not initialized");
      let personId = candidate.person_id;
      if (!personId) {
        const { data, error } = await db
          .from("people")
          .insert({ org_id: orgId, name: f.name.trim(), role_id: roleId, status: "candidate", note: f.current_company ? `Hired from ${f.current_company}` : null })
          .select("id")
          .single();
        if (error) throw error;
        personId = data.id as string;
      }
      const { error } = await db.from("candidates").update({ ...payload(), outcome: "to_onboard", person_id: personId }).eq("id", candidate.id);
      if (error) throw error;
      await db.from("candidate_events").insert({ candidate_id: candidate.id, kind: "outcome", outcome: "to_onboard" });
    },
    onSuccess: () => {
      toast.success(t("rec.saved"));
      qc.invalidateQueries({ refetchType: "all" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("candidates").delete().eq("id", candidate!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={f[k]} onChange={set(k)} disabled={!canEdit} className="h-8 text-sm" />
    </div>
  );

  const eventLabel = (e: CandidateEvent) => {
    if (e.kind === "created") return t("rec.ev.created");
    if (e.kind === "stage") return t("rec.ev.stage").replace("{v}", e.stage ?? "—");
    if (e.kind === "outcome") return t("rec.ev.outcome").replace("{v}", e.outcome ? t(`rec.out.${e.outcome}`) : "—");
    return [e.stage, e.interviewer].filter(Boolean).join(" · ");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{candidate ? candidate.name : t("rec.add")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("name", t("rec.c.name"))}
          {field("email", t("rec.f.email"), "email")}
          {field("phone", t("rec.f.phone"))}
          {field("current_company", t("rec.f.company"))}
          {field("current_title", t("rec.f.jobTitle"))}
          {field("location", t("rec.f.location"))}
          {field("source", t("rec.c.source"))}
          <div className="space-y-1">
            <Label className="text-xs">{t("rec.c.contract")}</Label>
            <Select value={f.contract_type} onValueChange={(v) => setF({ ...f, contract_type: v })} disabled={!canEdit}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTRACT_TYPE_EMPLOYEE}>{ctLabel(t, CONTRACT_TYPE_EMPLOYEE)}</SelectItem>
                <SelectItem value={CONTRACT_TYPE_LEASED}>{ctLabel(t, CONTRACT_TYPE_LEASED)}</SelectItem>
                {f.contract_type && ![CONTRACT_TYPE_EMPLOYEE, CONTRACT_TYPE_LEASED].includes(f.contract_type) && (
                  <SelectItem value={f.contract_type}>{f.contract_type}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {field("recruiter", t("rec.c.recruiter"))}
          {field("rating", t("rec.f.rating"), "number")}
          <div className="space-y-1">
            <Label className="text-xs">{t("rec.c.stage")}</Label>
            <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v })} disabled={!canEdit}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("rec.stageNone")} /></SelectTrigger>
              <SelectContent>
                {[...new Set([...stages, ...(f.stage ? [f.stage] : [])])].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("rec.c.outcome")}</Label>
            <Select value={f.outcome} onValueChange={(v) => setF({ ...f, outcome: v })} disabled={!canEdit}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.filter((o) => o !== "to_onboard" || f.outcome === "to_onboard").map((o) => (
                  <SelectItem key={o} value={o}>{t(`rec.out.${o}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {field("next_step_on", t("rec.f.nextDate"), "date")}
          <div className="sm:col-span-3">{field("next_step", t("rec.c.next"))}</div>
          <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
            {field("cv_url", t("rec.f.cv"))}
            {field("linkedin_url", t("rec.f.linkedin"))}
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs">{t("rec.f.notes")}</Label>
            <Textarea value={f.notes} onChange={set("notes")} disabled={!canEdit} rows={3} />
          </div>
        </div>

        {candidate && (
          <div className="mt-2 space-y-3 border-t border-border/50 pt-4">
            <h3 className="text-sm font-semibold">{t("rec.history")}</h3>
            {canEdit && (
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_auto]">
                <Input value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder={t("rec.notePh")} className="h-8 text-sm" />
                <Input value={ev.interviewer} onChange={(e) => setEv({ ...ev, interviewer: e.target.value })} placeholder={t("rec.interviewer")} className="h-8 text-sm" />
                <Input type="date" value={ev.happened_on} onChange={(e) => setEv({ ...ev, happened_on: e.target.value })} className="h-8 text-sm" />
                <Button size="sm" variant="outline" disabled={!ev.note.trim() || addEvent.isPending} onClick={() => addEvent.mutate()}>
                  {t("rec.addNote")}
                </Button>
              </div>
            )}
            <ul className="max-h-60 space-y-2 overflow-y-auto">
              {(events ?? []).map((e) => (
                <li key={e.id} className="rounded-lg border border-border/50 px-3 py-2 text-xs">
                  <p className="flex flex-wrap justify-between gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground">{eventLabel(e)}</span>
                    <span>{e.happened_on}{e.actor ? ` · ${e.actor}` : ""}</span>
                  </p>
                  {e.note && <p className="mt-1 whitespace-pre-wrap">{e.note}</p>}
                </li>
              ))}
            </ul>
            {candidate.person_id && (
              <Link to="/people/$personId" params={{ personId: candidate.person_id }} className="inline-flex items-center gap-1 text-xs text-brand">
                <ExternalLink className="size-3.5" /> {t("rec.linkedPerson")}
              </Link>
            )}
          </div>
        )}

        {canEdit && (
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex gap-2">
              {candidate && (
                <ConfirmAction title={t("rec.delete")} description={<p>{t("rec.deleteDesc")}</p>} confirmLabel={t("rec.delete")} onConfirm={() => remove.mutate()}>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-danger">
                    <Trash2 className="size-3.5" /> {t("rec.delete")}
                  </Button>
                </ConfirmAction>
              )}
              {candidate && !candidate.person_id && (
                <ConfirmAction title={t("rec.toOnboard")} description={<p>{t("rec.toOnboardDesc")}</p>} confirmLabel={t("rec.toOnboard")} onConfirm={() => toOnboard.mutate()}>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={!f.name.trim()}>
                    <UserCheck className="size-3.5" /> {t("rec.toOnboard")}
                  </Button>
                </ConfirmAction>
              )}
            </div>
            <Button onClick={() => save.mutate()} disabled={!f.name.trim() || save.isPending}>
              {t("rec.save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

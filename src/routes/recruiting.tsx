import { isOwnerRole } from "@/lib/app-roles";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ChevronDown, ExternalLink, FileText, Linkedin, Plus, RefreshCw, Search, Sparkles, Square, Trash2, UserCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCandidate, uploadCandidateCv } from "@/lib/candidate-ai.functions";
import { AiProviderSelect } from "@/components/AiProviderSelect";
import type { AiProvider } from "@/lib/ai.functions";
import { AppShell } from "@/components/AppShell";
import { RecruitingTabs } from "@/components/RecruitingTabs";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { RoleMenu } from "@/routes/index";
import { VisibleToPicker } from "@/components/VisibleToPicker";
import { PersonPicker } from "@/components/PersonPicker";
import { fetchOrgNodes, subtreeIds } from "@/lib/org-tree";
import { toastUndoable } from "@/lib/ui-feedback";
import { db } from "@/lib/db-client";
import { syncTeamTailor } from "@/lib/teamtailor.functions";
import { onboardingDate } from "@/lib/candidate-onboarding";
import { recruitingRoleStatus } from "@/lib/recruiting-role-status";
import { processDueOnboardings } from "@/lib/candidate-autohire.functions";
import { overviewCandidates, teamForRole } from "@/lib/recruiting-overview";
import { coverageOf, fetchRecruitingWorkspace, roleContractOf } from "@/lib/talent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/dates";
import { normalizedCandidate, recruitingStageOptions, OFFER_STAGES } from "@/lib/offer-workflow";
import { startOffer, getOffer, mutateOffer } from "@/lib/offer-workflow.functions";
import { OfferApprovalDialog } from "@/components/OfferApprovalBoard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function AiScoreDetail({ c, lang, canRerun, onRerun }: { c: Candidate; lang: string; canRerun: boolean; onRerun: () => void }) {
  const zh = lang === "zh";
  let reasons: Record<string, string> = {};
  try { reasons = c.ai_reasons ? JSON.parse(c.ai_reasons) : {}; } catch { reasons = {}; }
  const tone = (n: number) => (n >= 75 ? "bg-ok/15 text-ok" : n >= 55 ? "bg-brand/12 text-brand" : "bg-muted text-muted-foreground");
  const dims: [string, string, number | null | undefined, string][] = [
    ["jd_fit", zh ? "JD 匹配度" : "JD fit", c.ai_jd_fit, "40%"],
    ["education", zh ? "教育背景" : "Education", c.ai_education, "15%"],
    ["experience", zh ? "工作经历" : "Experience", c.ai_experience, "15%"],
    ["skills", zh ? "技能" : "Skills", c.ai_skills, "15%"],
    ["publications", zh ? "论文 / 成果" : "Publications", c.ai_publications, "15%"],
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={zh ? "查看评分详情" : "View score details"} className={`inline-block min-w-8 rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums underline-offset-2 hover:underline ${tone(c.ai_score ?? 0)}`}>{c.ai_score}</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 text-xs">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">{c.name}</p>
          <span className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${tone(c.ai_score ?? 0)}`}>{zh ? "总分" : "Overall"} {c.ai_score}</span>
        </div>
        {c.ai_summary && <p className="text-muted-foreground">{c.ai_summary}</p>}
        <ul className="space-y-2">
          {dims.map(([k, label, v, w]) => (
            <li key={k}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{label} <span className="text-muted-foreground">· {w}</span></span>
                <span className="tabular-nums font-semibold">{v ?? "—"}</span>
              </div>
              {reasons[k] && <p className="mt-0.5 text-muted-foreground">{reasons[k]}</p>}
            </li>
          ))}
        </ul>
        {!c.ai_reasons && <p className="text-muted-foreground">{zh ? "该结果是旧版分析，重新分析后可看到每项评分理由。" : "Older result — re-run to see a reason for each score."}</p>}
        {canRerun && <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onRerun}><Sparkles className="mr-1 size-3.5" />{zh ? "重新分析" : "Re-analyse"}</Button>}
      </PopoverContent>
    </Popover>
  );
}

/** Leaving the Offer stages withdraws any open Offer request and clears its Offer next step. */
async function leaveOfferStage(c: Candidate, stage: string | null | undefined) {
  if (!stage || (OFFER_STAGES as readonly string[]).includes(stage)) return false;
  if (c.offer_request_id) {
    const { offer: o } = await getOffer({ data: { id: c.offer_request_id } });
    if (!["withdrawn", "accepted", "onboarded"].includes(o.state)) {
      try { await mutateOffer({ data: { id: o.id, revision: o.revision, command: "withdraw", hiring_manager_user_id: "", lab_director_user_id: "", hrd_user_id: "", note: "Stage changed to " + stage } }); } catch (e) { console.warn("Offer withdraw skipped", e); }
    }
    return true;
  }
  return false;
}
const OFFER_NEXT_STEPS = ["Offer approval", "Send offer", "Await acceptance", "Revise offer"];

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
  component: function RecruitingPage() {
    const { t } = useI18n();
    return (
      <AppShell title={t("rec.title")}>
        <RecruitingTabs active="candidates" />
        <RecruitingBody />
      </AppShell>
    );
  },
});

const DEFAULT_STAGES = ["CV Screen", "Phone Interview", "Hiring Manager Interview", "Technical Interview", "Final Interview", "Reference Check"];
const OUTCOMES = ["active", "on_hold", "to_onboard", "hired", "rejected", "offer_declined", "withdrawn"] as const;
const FILTERS = {
  active: ["active", "on_hold", "offer", "offer_accepted"],
  to_onboard: ["to_onboard"],
  hired: ["hired"],
  closed: ["rejected", "offer_declined", "withdrawn"],
  all: [...OUTCOMES],
} as const;
type FilterKey = keyof typeof FILTERS;

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_TONE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warn/10 text-warn",
  low: "bg-muted text-muted-foreground",
};
const OUTCOME_TONE: Record<string, string> = {
  active: "bg-brand/12 text-brand",
  on_hold: "bg-muted text-muted-foreground",
  offer: "bg-warn/12 text-warn",
  offer_accepted: "bg-ok/12 text-ok",
  to_onboard: "bg-ok/12 text-ok",
  hired: "bg-ok/20 text-ok",
  rejected: "bg-danger/10 text-danger",
  offer_declined: "bg-danger/10 text-danger",
  withdrawn: "bg-danger/10 text-danger",
};

const CONTRACT_TYPE_EMPLOYEE = "Employee";
const CONTRACT_TYPE_LEASED = "Leased Employee";
const CONTRACT_TYPE_INTERN = "Intern";
const CONTRACT_TYPES = [CONTRACT_TYPE_EMPLOYEE, CONTRACT_TYPE_LEASED, CONTRACT_TYPE_INTERN] as const;
function ctLabel(t: (k: string) => string, v: string | null): string {
  if (!v) return "—";
  return (CONTRACT_TYPES as readonly string[]).includes(v) ? t(`rec.ct.${v}`) : v;
}

export type Candidate = {
  cv_text?: string | null;
  id: string;
  role_id: string;
  offer_request_id?: string | null;
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
  onboarding_on: string | null;
  notes: string | null;
  contract_type: string | null;
  priority: string;
  person_id: string | null;
  updated_at: string;
  ai_score?: number | null;
  ai_jd_fit?: number | null;
  ai_education?: number | null;
  ai_experience?: number | null;
  ai_skills?: number | null;
  ai_publications?: number | null;
  ai_summary?: string | null;
  ai_reasons?: string | null;
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
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const canEdit = isOwnerRole(user?.role) || user?.role === "hr" || user?.role === "recruiter";
  const canEditRole = isOwnerRole(user?.role) || user?.role === "hr" || user?.role === "recruiter";
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/recruiting" });
  const { role: roleId } = Route.useSearch();
  const [openOnly, setOpenOnly] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Candidate | "new" | null>(null);
  const [rolesOpen, setRolesOpen] = useState(true);
  const [lab, setLab] = useState<string>("all");
  const [overviewTeam, setOverviewTeam] = useState("all");
  const [overviewStatus, setOverviewStatus] = useState("all");
  const [overviewQuery, setOverviewQuery] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [offerId, setOfferId] = useState<string | null>(null);
  const openOffer = useMutation({
    mutationFn: (candidate: Candidate) => candidate.offer_request_id ? Promise.resolve({ id: candidate.offer_request_id }) : startOffer({ data: { candidate_id: candidate.id } }),
    onSuccess: (r) => { setOfferId(r.id); qc.invalidateQueries({ queryKey: ["candidates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: ws } = useQuery({ queryKey: ["workspace", "recruiting"], queryFn: fetchRecruitingWorkspace });
  const { data: orgNodes = [] } = useQuery({ queryKey: ["orgNodes"], queryFn: fetchOrgNodes });
  const analyzeFn = useServerFn(analyzeCandidate);
  const uploadCvFn = useServerFn(uploadCandidateCv);
  const pickCv = (c: Candidate) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".pdf,.docx";
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error(lang === "zh" ? "文件不能超过 10 MB" : "File must be 10 MB or smaller"); return; }
      try {
        const buf = new Uint8Array(await file.arrayBuffer()); let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        await uploadCvFn({ data: { id: c.id, base64: btoa(bin) } });
        toast.success(lang === "zh" ? "简历已上传，可以 AI 分析" : "CV uploaded; ready for AI analysis");
        await qc.invalidateQueries({ queryKey: ["candidates"] });
      } catch (e) { toast.error((e as Error).message); }
    };
    inp.click();
  };
  const [aiProvider, setAiProvider] = useState<AiProvider | undefined>(undefined);
  const [aiRun, setAiRun] = useState<{ done: number; total: number; failed: number } | null>(null);
  const aiStop = useRef(false);
  const [sortByAi, setSortByAi] = useState(false);
  const runAi = async (targets: Candidate[]) => {
    if (!targets.length) return;
    aiStop.current = false;
    let failed = 0;
    let lastErr = "";
    setAiRun({ done: 0, total: targets.length, failed: 0 });
    for (let i = 0; i < targets.length; i++) {
      if (aiStop.current) break;
      try { await analyzeFn({ data: { id: targets[i]!.id, lang, provider: aiProvider } }); }
      catch (e) {
        failed++; lastErr = (e as Error).message;
        if (/credit|quota|forbidden|unauthor|429|402/i.test(lastErr)) break;
      }
      setAiRun({ done: i + 1, total: targets.length, failed });
    }
    setAiRun(null);
    await qc.invalidateQueries({ queryKey: ["candidates"] });
    if (failed) toast.error(`${lang === "zh" ? "AI 分析失败" : "AI analysis failed"} (${failed}): ${lastErr}`);
    else toast.success(lang === "zh" ? "AI 分析完成" : "AI analysis complete");
  };
  const syncTt = useMutation({
    mutationFn: (selectedRoleId: string) => syncTeamTailor({ data: { roleId: selectedRoleId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      const parts = [t("rec.syncDone").replace("{n}", String(r.imported))];
      if (r.updated) parts.push(t("rec.syncUpdated").replace("{n}", String(r.updated)));
      if (r.unchanged) parts.push(t("rec.syncUnchanged").replace("{n}", String(r.unchanged)));
      if (r.skippedDuplicates) parts.push(t("rec.syncSkipped").replace("{n}", String(r.skippedDuplicates)));
      if (r.unmatched) parts.push(t("rec.syncUnmatched").replace("{n}", String(r.unmatched)));
      if (r.skippedRejected) parts.push(t("rec.syncRejected").replace("{n}", String(r.skippedRejected)));
      if (r.matchedJobs === 0) { toast.warning(t("rec.syncNoJobs")); return; }
      if (!r.imported && !r.updated && !r.unchanged && !r.skippedRejected) parts.push(t("rec.syncNoApps").replace("{n}", String(r.matchedJobs)));
      if (r.capped) parts.push(t("rec.syncCapped"));
      toast.success(parts.join(" · "));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRole = useMutation({
    // Strategic roles are only hidden from Recruiting; recruiting-only roles are archived outright.
    mutationFn: async (id: string) => {
      const role = ws?.roles.find((r) => r.id === id);
      const { error } = await db.from("roles").update(role?.recruiting_only ? { archived: true } : { recruiting_archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      if (roleId === id) {
        setEditing(null);
        navigate({ search: {} });
      }
      qc.invalidateQueries({ refetchType: "all" });
      toastUndoable(t("rec.roleRemoved"), t("ui.undo"), async () => {
        const { error } = await db.from("roles").update({ archived: false, recruiting_archived: false }).eq("id", id);
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
  const stages = recruitingStageOptions(stageItems && stageItems.length ? stageItems.filter((s) => s.active).map((s) => s.name) : DEFAULT_STAGES);

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        const r = await processDueOnboardings();
        if (r.moved) qc.invalidateQueries({ queryKey: ["workspace"] });
      } catch { /* non-blocking */ }
      const { data, error } = await db.from("candidates").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Candidate[]).map(normalizedCandidate);
    },
  });

  const roles = ws?.roles ?? [];
  const people = ws?.people ?? [];
  const activeByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates ?? []) if ((FILTERS.active as readonly string[]).includes(c.outcome)) m.set(c.role_id, (m.get(c.role_id) ?? 0) + 1);
    return m;
  }, [candidates]);
  const onboardingByRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of candidates ?? []) {
      if (candidate.outcome === "to_onboard") {
        counts.set(candidate.role_id, (counts.get(candidate.role_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [candidates]);

  const nodeById = new Map(orgNodes.map((n) => [n.id, n]));
  const labOf = (id: string | null | undefined) => {
    let n = id ? nodeById.get(id) : undefined;
    while (n && n.type.toLowerCase() !== "lab" && n.parent_id) n = nodeById.get(n.parent_id);
    return n && n.type.toLowerCase() === "lab" ? n : null;
  };
  // Managers only see roles inside their responsible Labs/Teams.
  const scopeIds = user?.role === "manager" ? new Set(user.scope_node_ids.flatMap((id) => subtreeIds(orgNodes, id))) : null;
  const scopedRoles = scopeIds
    ? roles.filter((r) => {
        const l = labOf(r.org_node_id);
        return (r.org_node_id && scopeIds.has(r.org_node_id)) || (l && scopeIds.has(l.id));
      })
    : roles;
  const labs = orgNodes.filter((n) => n.type.toLowerCase() === "lab" && scopedRoles.some((r) => labOf(r.org_node_id)?.id === n.id));
  const roleList = scopedRoles
    .filter((r) => lab === "all" || labOf(r.org_node_id)?.id === lab)
    .map((r) => {
      const cov = coverageOf(r, people);
      return { r, cov, status: recruitingRoleStatus(cov.gap, onboardingByRole.get(r.id) ?? 0) };
    })
    .filter(({ r, cov }) => !openOnly || cov.gap > 0 || r.id === roleId || activeByRole.has(r.id));
  const role = scopedRoles.find((r) => r.id === roleId && (lab === "all" || labOf(r.org_node_id)?.id === lab)) ?? null;
  const editingRole = editing && editing !== "new" ? scopedRoles.find((r) => r.id === editing.role_id) : role;
  // The Lab filter also scopes the cross-role candidate overview below.
  const labRoles = scopedRoles.filter((r) => lab === "all" || labOf(r.org_node_id)?.id === lab);
  const overviewTeams = orgNodes.filter((n) => n.type.toLowerCase() === "team" && labRoles.some((r) => teamForRole(r.org_node_id, orgNodes) === n.id));
  const effectiveOverviewTeam = lab !== "all" && overviewTeam !== "all" && !overviewTeams.some((tm) => tm.id === overviewTeam) ? "all" : overviewTeam;
  const overviewBase = overviewCandidates(candidates ?? [], labRoles, orgNodes, effectiveOverviewTeam);
  const overviewRows = overviewCandidates(overviewBase, labRoles, orgNodes, effectiveOverviewTeam, overviewStatus)
    .filter((c) => {
      const position = scopedRoles.find((r) => r.id === c.role_id);
      const q = overviewQuery.trim().toLowerCase();
      return !q || [c.name, c.email, position?.title, position?.job_title].some((v) => v?.toLowerCase().includes(q));
    });

  const rows = (candidates ?? [])
    .filter((c) => c.role_id === roleId)
    .filter((c) => (FILTERS[filter] as readonly string[]).includes(c.outcome))
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return [c.name, c.current_company, c.current_title, c.source, c.recruiter, c.stage].some((v) => v?.toLowerCase().includes(q));
    })
    .sort((a, b) => sortByAi ? (b.ai_score ?? -1) - (a.ai_score ?? -1) : (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1));
  const countFor = (k: FilterKey) => (candidates ?? []).filter((c) => c.role_id === roleId && (FILTERS[k] as readonly string[]).includes(c.outcome)).length;

  const quickUpdate = useMutation({
    mutationFn: async ({ c, patch }: { c: Candidate; patch: Partial<Candidate> }) => {
      if (patch.stage && !(OFFER_STAGES as readonly string[]).includes(patch.stage)) {
        await leaveOfferStage(c, patch.stage);
        if (c.next_step && OFFER_NEXT_STEPS.includes(c.next_step)) patch = { ...patch, next_step: null };
      }
      if (patch.stage && c.offer_request_id && (OFFER_STAGES as readonly string[]).includes(patch.stage) && patch.stage !== "Offer approval") {
        const { offer: o } = await getOffer({ data: { id: c.offer_request_id } });
        await mutateOffer({ data: { id: o.id, revision: o.revision, command: "set_stage", stage: patch.stage as "Offer sent", hiring_manager_user_id: "", lab_director_user_id: "", hrd_user_id: "", note: "" } });
        return;
      }
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
    <div className="space-y-4">
      <section className="card-glass min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <button type="button" onClick={() => setOverviewOpen(!overviewOpen)} className="flex items-center gap-1.5" aria-expanded={overviewOpen}>
            <ChevronDown className={`size-4 transition-transform ${overviewOpen ? "" : "-rotate-90"}`} />
            <h2 className="font-display text-sm font-semibold">{t("rec.overview")}</h2>
            <span className="text-xs text-muted-foreground">({overviewBase.length})</span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {lab === "all" && (
              <Select value={overviewTeam} onValueChange={setOverviewTeam}>
                <SelectTrigger className="h-8 w-44 text-xs" aria-label={t("rec.team")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("rec.allTeams")}</SelectItem>
                  {overviewTeams.map((team) => <SelectItem key={team.id} value={team.id}>{labOf(team.id)?.name} · {team.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <Input value={overviewQuery} onChange={(e) => setOverviewQuery(e.target.value)} aria-label={t("rec.overview.search")} placeholder={t("rec.overview.search")} className="h-8 w-48 pl-8 text-xs" />
            </div>
          </div>
        </div>
        {overviewOpen && <div className="flex flex-wrap gap-1 border-b border-border/60 px-4 py-2">
          {["all", "offer", "offer_accepted", "to_onboard"].map((status) => <Button key={status} size="sm" variant="ghost" aria-pressed={overviewStatus === status} onClick={() => setOverviewStatus(status)} className={`h-7 gap-2 px-2.5 text-xs ${overviewStatus === status ? "bg-brand/12 text-brand" : "text-muted-foreground"}`}>
            {t(`rec.overview.${status}`)}<span className="tabular-nums">{overviewBase.filter((c) => status === "all" || (status === "offer" ? c.stage === "Offer sent" : status === "offer_accepted" ? c.stage === "Offer accepted" && c.outcome !== "to_onboard" : c.outcome === status)).length}</span>
          </Button>)}
        </div>}
        {overviewOpen && <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-background/95 text-muted-foreground backdrop-blur">
              <tr>
                {["rec.c.name", "rec.roleTitle", "rec.team", "rec.c.outcome", "rec.f.startDate", "rec.c.next", "rec.c.recruiter"].map((key) => <th key={key} className="px-4 py-2 font-medium">{t(key)}</th>)}
              </tr>
            </thead>
            <tbody>
              {overviewRows.map((candidate) => {
                const position = scopedRoles.find((r) => r.id === candidate.role_id);
                const teamId = teamForRole(position?.org_node_id ?? null, orgNodes);
                return <tr key={candidate.id} className="border-t border-border/40 hover:bg-surface-raised/40">
                  <td className="px-4 py-2"><Button variant="link" onClick={() => setEditing(candidate)} className="h-auto whitespace-normal p-0 text-left text-xs font-medium">{candidate.name}</Button></td>
                  <td className="max-w-56 px-4 py-2"><Button variant="link" className="h-auto whitespace-normal p-0 text-left text-xs" onClick={() => navigate({ search: { role: candidate.role_id } })}>{position?.title}</Button>{position?.job_title && <p className="mt-0.5 text-muted-foreground">{position.job_title}</p>}</td>
                  <td className="px-4 py-2">{teamId ? nodeById.get(teamId)?.name : "—"}<p className="text-muted-foreground">{labOf(position?.org_node_id)?.name}</p></td>
                  <td className="px-4 py-2"><span className={`whitespace-nowrap rounded px-1.5 py-0.5 ${OUTCOME_TONE[candidate.outcome] ?? ""}`}>{candidate.outcome === "to_onboard" ? t("rec.out.to_onboard") : candidate.stage ?? t(`rec.out.${candidate.outcome}`)}</span></td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDate(candidate.onboarding_on)}</td>
                  <td className="max-w-48 px-4 py-2">{candidate.next_step || "—"}{candidate.next_step_on && <p className="text-muted-foreground tabular-nums">{formatDate(candidate.next_step_on)}</p>}</td>
                  <td className="px-4 py-2">{candidate.recruiter || "—"}</td>
                </tr>;
              })}
              {overviewRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t("rec.overview.empty")}</td></tr>}
            </tbody>
          </table>
        </div>}
      </section>
      <section className="card-glass p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <button type="button" onClick={() => setRolesOpen(!rolesOpen)} className="flex items-center gap-1.5">
            <ChevronDown className={`size-4 transition-transform ${rolesOpen ? "" : "-rotate-90"}`} />
            <h2 className="font-display text-sm font-semibold">{t("rec.roles")}</h2>
            <span className="text-xs text-muted-foreground">({roleList.length})</span>
            {!rolesOpen && role && <span className="ml-2 text-xs text-brand">· {role.title}</span>}
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            {labs.length > 1 && (
              <>
                <button type="button" onClick={() => { setLab("all"); navigate({ search: {} }); }} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${lab === "all" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  {t("rec.allLabs")}
                </button>
                {labs.map((l) => (
                  <button key={l.id} type="button" onClick={() => { setLab(l.id); if (lab !== l.id) navigate({ search: {} }); }} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${lab === l.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                    {l.name}
                  </button>
                ))}
              </>
            )}
            <label className="ml-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              {t("rec.openOnly")}
            </label>
          </div>
        </div>
        {rolesOpen && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {roleList.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">{t("rec.noRoles")}</li>}
          {roleList.map(({ r, cov, status }) => (
            <li key={r.id} className="group relative">
              <Button
                variant="ghost"
                onClick={() => navigate({ search: { role: r.id } })}
                className={`h-auto w-full flex-col items-start gap-0 rounded-lg border border-border/50 px-2.5 py-2 ${canEditRole ? "pr-10" : ""} text-left text-sm whitespace-normal transition-colors ${r.id === roleId ? "border-brand/60 bg-brand/12 text-foreground" : "hover:bg-surface-raised/60"}`}
              >
                <p className="flex w-full items-center gap-1.5 font-medium"><span className="truncate">{r.title}</span></p>
                <p className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
                  <span className={status === "open" ? "text-danger" : "text-ok"}>
                    {status === "to_onboard" ? t("rec.out.to_onboard") : status === "filled" ? t("rec.full") : t("rec.gap").replace("{n}", String(cov.gap))}
                  </span>
                  {activeByRole.get(r.id) ? <span>{t("rec.active").replace("{n}", String(activeByRole.get(r.id)))}</span> : null}
                  {labOf(r.org_node_id) && <span className="truncate">· {labOf(r.org_node_id)?.name}</span>}
                </p>
              </Button>
              {canEditRole && <RoleMenu
                withVisibility
                showOwners
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
        )}
      </section>

      <section className="card-glass min-w-0 overflow-hidden">
        {!role ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">{t("rec.pickRole")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{role.title}</h2>
                {role.job_title && <p className="text-xs text-muted-foreground">{t("pp.f.offerTitle")}: {role.job_title}</p>}
                <p className="text-xs text-muted-foreground">
                  {t("rec.c.contract")}: {t(`idx.ct.${roleContractOf(role)}`)}
                  <span className="mx-1.5">·</span>
                  {t("rec.roleRecruiter")}: {people.find((p) => p.id === role.recruiter_person_id)?.name ?? "—"}
                  <span className="mx-1.5">·</span>
                  {t("rec.roleSupervisor")}: {people.find((p) => p.id === role.supervisor_person_id)?.name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Level {role.level_min}–{role.level_max} · {coverageOf(role, people).filled}/{role.target_count}
                </p>
                {(() => {
                  const lab = labOf(role.org_node_id);
                  const team = role.org_node_id && role.org_node_id !== lab?.id ? role.org_node_id : null;
                  const live = people.filter((p) => p.status !== "left" && !p.archived);
                  const inLab = (id: string | null | undefined) => { let n = orgNodes.find((x) => x.id === id); while (n) { if (n.id === lab?.id) return true; n = orgNodes.find((x) => x.id === n!.parent_id); } return false; };
                  const dir = lab ? live.filter((p) => p.is_leader && p.org_node_id === lab.id) : [];
                  const plr = lab ? live.filter((p) => p.is_plr && inLab(p.org_node_id)) : [];
                  const lead = team ? live.filter((p) => p.is_leader && p.org_node_id === team) : [];
                  const parts = [
                    dir.length ? `${t("chart.labDirector")}: ${dir.map((p) => p.name).join(", ")}` : null,
                    plr.length ? `PLR: ${plr.map((p) => p.name).join(", ")}` : null,
                    lead.length ? `${t("chart.teamLead")}: ${lead.map((p) => p.name).join(", ")}` : null,
                  ].filter(Boolean);
                  return parts.length ? <p className="mt-0.5 text-[11px] text-muted-foreground">{t("rec.visibleTo")} {parts.join(" · ")}</p> : null;
                })()}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("rec.search")} className="h-9 w-56 pl-8 text-sm" />
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={syncTt.isPending} onClick={() => syncTt.mutate(role.id)}>
                    <RefreshCw className={`size-4 ${syncTt.isPending ? "animate-spin" : ""}`} /> {syncTt.isPending ? t("rec.syncing") : t("rec.sync")}
                  </Button>
                )}
                {canEdit && <AiProviderSelect value={aiProvider} onChange={setAiProvider} />}
                {canEdit && (aiRun ? (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">AI {aiRun.done} / {aiRun.total}</span>
                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => { aiStop.current = true; }}><Square className="size-3.5" />{lang === "zh" ? "停止" : "Stop"}</Button>
                  </span>
                ) : (() => {
                  const ttRows = rows.filter((c) => c.source === "TeamTailor" || !!c.cv_text?.trim());
                  const pending = ttRows.filter((c) => c.ai_score == null);
                  const targets = pending.length ? pending : ttRows;
                  return (
                    <ConfirmAction
                      title={lang === "zh" ? "AI 批量分析候选人" : "AI-analyse candidates"}
                      description={lang === "zh" ? `将根据岗位 JD 和 TeamTailor 简历分析 ${targets.length} 位${pending.length ? "未分析的" : "（重新分析全部）"}候选人，会消耗 AI 额度。` : `Score ${targets.length} ${pending.length ? "unanalysed" : "(re-analyse all)"} candidates against the JD from their TeamTailor CVs. Uses AI credits.`}
                      confirmLabel={lang === "zh" ? "开始" : "Start"}
                      onConfirm={() => void runAi(targets)}
                    >
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={!targets.length}><Sparkles className="size-4" />{lang === "zh" ? "AI 分析" : "AI analyse"}</Button>
                    </ConfirmAction>
                  );
                })())}
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
                    <th className="px-3 py-2">{t("rec.c.priority")}</th>
                    <th className="px-3 py-2">{t("rec.c.name")}</th>
                    <th className="px-3 py-2"><button type="button" className={`uppercase ${sortByAi ? "text-brand" : "hover:text-foreground"}`} onClick={() => setSortByAi((v) => !v)} title={lang === "zh" ? "按 AI 分数排序" : "Sort by AI score"}>AI {sortByAi ? "↓" : "↕"}</button></th>
                    <th className="px-3 py-2">{t("rec.c.current")}</th>
                    <th className="px-3 py-2">{t("rec.c.stage")}</th>
                    <th className="px-3 py-2">{t("rec.c.outcome")}</th>
                    <th className="px-3 py-2">{t("rec.c.next")}</th>
                    <th className="px-3 py-2">{t("rec.c.links")}</th>
                    <th className="px-3 py-2">{t("rec.c.recruiter")}</th>
                    <th className="px-3 py-2">{t("rec.c.source")}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{t("rec.c.contract")}</th>
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
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_TONE[c.priority] ?? ""}`}>{t(`rec.pr.${c.priority ?? "medium"}`)}</span>
                        </td>
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
                        <td className="px-3 py-1.5">
                          {c.ai_score != null ? (
                            <AiScoreDetail c={c} lang={lang} canRerun={canEdit && !aiRun} onRerun={() => void runAi([c])} />
                          ) : canEdit && !aiRun && (c.source === "TeamTailor" || !!c.cv_text?.trim()) ? (
                            <button type="button" className="text-muted-foreground hover:text-brand" title={lang === "zh" ? "AI 分析" : "AI analyse"} onClick={() => void runAi([c])}><Sparkles className="size-3.5" /></button>
                          ) : canEdit && !aiRun ? (
                            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-brand hover:underline" title={lang === "zh" ? "上传简历（PDF / .docx）以便 AI 分析" : "Upload CV (PDF/.docx) for AI analysis"} onClick={() => pickCv(c)}>{lang === "zh" ? "传简历" : "CV"}</button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="max-w-48 truncate px-3 py-1.5 text-xs text-muted-foreground">
                          {[c.current_company, c.current_title].filter(Boolean).join(" · ") || "—"}
                        </td>
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
                            disabled={!canEdit || !!c.offer_request_id}
                            onValueChange={(v) => {
                              if (v === "to_onboard" || v === "offer_accepted") quickUpdate.mutate({ c, patch: { outcome: v } }, {
                                onSuccess: () => setEditing({ ...c, outcome: v }),
                              });
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
                          {c.next_step_on && <p className="text-muted-foreground tabular-nums">{formatDate(c.next_step_on)}</p>}
                          {(c.outcome === "to_onboard" || c.stage === "Offer accepted") && c.onboarding_on && (
                            <p className="whitespace-nowrap text-ok tabular-nums">{t("rec.f.startDate")}: {formatDate(c.onboarding_on)}</p>
                          )}
                          {(c.offer_request_id || c.stage === "Offer approval") && <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" disabled={openOffer.isPending} onClick={() => openOffer.mutate(c)}>Offer approval →</Button>}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="flex gap-1.5 text-muted-foreground">
                            {cv && <a href={cv} target="_blank" rel="noopener noreferrer" className="hover:text-brand" title="CV"><FileText className="size-4" /></a>}
                            {li && <a href={li} target="_blank" rel="noopener noreferrer" className="hover:text-brand" title="LinkedIn"><Linkedin className="size-4" /></a>}
                            {!cv && !li && "—"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{c.recruiter || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{c.source || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{ctLabel(t, c.contract_type)}</td>
                        <td className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{formatDate(c.updated_at)}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-6 py-12 text-center text-sm text-muted-foreground">{t("rec.empty")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {editing && editingRole && (
        <CandidateDialog
          key={editing === "new" ? "new" : editing.id}
          candidate={editing === "new" ? null : editing}
          roleId={editingRole.id}
          orgId={ws.org?.id ?? null}
          stages={stages}
          canEdit={canEdit}
          onOffer={(c) => { setEditing(null); openOffer.mutate(c); }}
          onClose={() => setEditing(null)}
        />
      )}
      {offerId && <OfferApprovalDialog id={offerId} onClose={() => setOfferId(null)} />}
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
  onOffer,
}: {
  candidate: Candidate | null;
  roleId: string;
  orgId: string | null;
  stages: string[];
  canEdit: boolean;
  onClose: () => void;
  onOffer: (c: Candidate) => void;
}) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const uploadCv = useServerFn(uploadCandidateCv);
  const [cvBusy, setCvBusy] = useState(false);
  const [hasCvText, setHasCvText] = useState(!!candidate?.cv_text?.trim());
  const pickCvFile = () => {
    if (!candidate) return;
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".pdf,.docx";
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error(lang === "zh" ? "文件不能超过 10 MB" : "File must be 10 MB or smaller"); return; }
      setCvBusy(true);
      try {
        const buf = new Uint8Array(await file.arrayBuffer()); let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        await uploadCv({ data: { id: candidate.id, base64: btoa(bin) } });
        setHasCvText(true);
        toast.success(lang === "zh" ? "简历已上传，可以 AI 分析" : "CV uploaded; ready for AI analysis");
        await qc.invalidateQueries({ queryKey: ["candidates"] });
      } catch (e) { toast.error((e as Error).message); } finally { setCvBusy(false); }
    };
    inp.click();
  };
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
    onboarding_on: candidate?.onboarding_on ?? "",
    notes: candidate?.notes ?? "",
    contract_type: candidate?.contract_type ?? "",
    priority: candidate?.priority ?? "medium",
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
      onboarding_on: onboardingDate(f.onboarding_on),
      notes: n(f.notes),
      contract_type: n(f.contract_type),
      priority: f.priority || "medium",
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const p = payload();
      if (candidate && p.stage && !(OFFER_STAGES as readonly string[]).includes(p.stage)) {
        const left = await leaveOfferStage(candidate, p.stage);
        if (p.next_step && OFFER_NEXT_STEPS.includes(p.next_step)) p.next_step = null;
        if (left) {
          const { error } = await db.from("candidates").update(p).eq("id", candidate.id);
          if (error) throw error;
          await db.from("candidate_events").insert({ candidate_id: candidate.id, kind: "stage", stage: p.stage });
          return;
        }
      }
      if (candidate?.offer_request_id) {
        const { name: _name, next_step: _next, ...editable } = p;
        const { error } = await db.from("candidates").update(editable).eq("id", candidate.id);
        if (error) throw error;
        return;
      }
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
      if (candidate && f.stage === "Offer approval" && !candidate.offer_request_id) onOffer(candidate);
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
      <Input type={type} value={f[k]} onChange={set(k)} disabled={!canEdit || (!!candidate?.offer_request_id && ["name", "next_step"].includes(k))} className="h-8 text-sm" />
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
          <div className="space-y-1">
            <Label className="text-xs">{t("rec.c.priority")}</Label>
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })} disabled={!canEdit}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["high", "medium", "low"].map((p) => <SelectItem key={p} value={p}>{t(`rec.pr.${p}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {field("source", t("rec.c.source"))}
          <div className="space-y-1">
            <Label className="text-xs">{t("rec.c.contract")}</Label>
            <Select value={f.contract_type} onValueChange={(v) => setF({ ...f, contract_type: v })} disabled={!canEdit || !!candidate?.offer_request_id}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTRACT_TYPE_EMPLOYEE}>{ctLabel(t, CONTRACT_TYPE_EMPLOYEE)}</SelectItem>
                <SelectItem value={CONTRACT_TYPE_LEASED}>{ctLabel(t, CONTRACT_TYPE_LEASED)}</SelectItem>
                <SelectItem value={CONTRACT_TYPE_INTERN}>{ctLabel(t, CONTRACT_TYPE_INTERN)}</SelectItem>
                {f.contract_type && ![CONTRACT_TYPE_EMPLOYEE, CONTRACT_TYPE_LEASED, CONTRACT_TYPE_INTERN].includes(f.contract_type) && (
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
            <Select value={f.outcome} onValueChange={(v) => setF({ ...f, outcome: v })} disabled={!canEdit || !!candidate?.offer_request_id}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{t(`rec.out.${o}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {field("next_step_on", t("rec.f.nextDate"), "date")}
          {candidate && field("onboarding_on", t("rec.f.startDate"), "date")}
          <div className="sm:col-span-3">{field("next_step", t("rec.c.next"))}</div>
          {candidate?.offer_request_id && <Button variant="outline" onClick={() => onOffer(candidate)}>Offer approval →</Button>}
          <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
            {field("cv_url", t("rec.f.cv"))}
            {field("linkedin_url", t("rec.f.linkedin"))}
            {candidate && canEdit && (
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button type="button" variant="outline" size="sm" disabled={cvBusy} onClick={pickCvFile}>
                  {cvBusy ? (lang === "zh" ? "上传中…" : "Uploading…") : hasCvText ? (lang === "zh" ? "重新上传简历文件" : "Replace CV file") : (lang === "zh" ? "上传简历文件（PDF / .docx）" : "Upload CV file (PDF / .docx)")}
                </Button>
                {hasCvText && <span className="text-xs text-ok">{lang === "zh" ? "已上传简历，AI 分析将优先使用" : "CV uploaded; AI uses it first"}</span>}
              </div>
            )}
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
                    <span>{formatDate(e.happened_on)}{e.actor ? ` · ${e.actor}` : ""}</span>
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
              {candidate && !candidate.person_id && !candidate.offer_request_id && (
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

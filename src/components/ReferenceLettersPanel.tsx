import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { fetchOrgNodes } from "@/lib/org-tree";
import { labTeamOf } from "@/lib/contract";
import { supervisorOf } from "@/lib/supervisor";
import { fetchGrowthData } from "@/lib/growth";
import { fetchLifecycleEvents, reasonLabelKey } from "@/lib/lifecycle";
import type { Person } from "@/lib/talent";
import {
  downloadDocx,
  downloadPdf,
  fetchRefTemplates,
  fetchReferenceLetters,
  fillTemplate,
  type RefFacts,
  type ReferenceLetter,
} from "@/lib/reference-letters";

const FACT_KEYS: (keyof RefFacts)[] = ["name", "lab", "team", "hire_date", "job_title", "workload", "exit_date", "exit_reason"];

const statusClass: Record<string, string> = {
  requested: "bg-warn/12 text-warn",
  submitted: "bg-brand/12 text-brand",
  approved: "bg-ok/12 text-ok",
};

async function fetchAllPeople() {
  const { data, error } = await supabase.from("people").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Person[];
}

export function ReferenceLettersPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isHr = user?.role === "owner" || user?.role === "hr";
  const people = useQuery({ queryKey: ["people-all"], queryFn: fetchAllPeople });
  const nodes = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const letters = useQuery({ queryKey: ["reference-letters"], queryFn: fetchReferenceLetters });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const list = letters.data ?? [];
  const open = list.find((l) => l.id === openId) ?? null;
  const isMine = (l: ReferenceLetter) => !!user && byId.get(l.supervisor_person_id ?? "")?.name === user.name;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{t("ref.tab")}</h2>
        {isHr && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> {t("ref.request")}
          </Button>
        )}
      </div>

      <div className="card-glass divide-y divide-border/50 rounded-xl">
        {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">{t("ref.empty")}</p>}
        {list.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setOpenId(l.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
          >
            <FileText className="size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.facts.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[l.facts.lab, l.facts.team].filter(Boolean).join(" / ")} · {t("ref.supervisor")}:{" "}
                {byId.get(l.supervisor_person_id ?? "")?.name ?? "—"} · {l.created_at.slice(0, 10)}
              </p>
            </div>
            {isMine(l) && l.status === "requested" && (
              <span className="rounded-full border border-warn/40 px-2 py-0.5 text-[10px] text-warn">{t("ref.mine")}</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass[l.status] ?? ""}`}>
              {t(`ref.status.${l.status}`)}
            </span>
          </button>
        ))}
      </div>

      {creating && people.data && nodes.data && (
        <RequestDialog people={people.data} nodes={nodes.data} onClose={() => setCreating(false)} />
      )}
      {open && (
        <LetterDialog letter={open} people={byId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

/* --------------------------- Request (HR) --------------------------- */

function RequestDialog({
  people,
  nodes,
  onClose,
}: {
  people: Person[];
  nodes: Awaited<ReturnType<typeof fetchOrgNodes>>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const tpl = useQuery({ queryKey: ["ref-templates"], queryFn: fetchRefTemplates });
  const events = useQuery({ queryKey: ["lifecycle-events"], queryFn: fetchLifecycleEvents });
  const [personId, setPersonId] = useState("");
  const [facts, setFacts] = useState<RefFacts | null>(null);
  const [supId, setSupId] = useState("");
  const [intro, setIntro] = useState("");

  const pick = (id: string) => {
    setPersonId(id);
    const p = people.find((x) => x.id === id)!;
    const { lab, team } = labTeamOf(nodes, p.org_node_id);
    const exit = (events.data ?? []).find((e) => e.person_id === id && e.event_type === "exit");
    const left = p.status === "left" || !!p.archived || !!exit;
    const f: RefFacts = {
      name: p.name,
      lab: lab?.name ?? "",
      team: team?.name ?? "",
      hire_date: p.hire_date ?? "",
      job_title: p.offer_title || p.appointed_role_title || "",
      workload: `${p.workload_pct ?? 100}%`,
      exit_date: left ? (exit?.effective_on ?? p.archived_at?.slice(0, 10) ?? "") : "",
      exit_reason: left && exit ? t(reasonLabelKey(exit.reason)) : "",
    };
    setFacts(f);
    setSupId(supervisorOf(p, people, nodes)?.id ?? "");
    const text = tpl.data?.text;
    if (text) setIntro(fillTemplate(f.exit_date ? text.left : text.current, f));
  };

  const updateFact = (k: keyof RefFacts, v: string) => {
    if (!facts) return;
    const f = { ...facts, [k]: v };
    setFacts(f);
    const text = tpl.data?.text;
    if (text) setIntro(fillTemplate(f.exit_date ? text.left : text.current, f));
  };

  const sup = people.find((p) => p.id === supId);
  const send = useMutation({
    mutationFn: async () => {
      if (!facts || !sup) throw new Error(t("ref.noSupervisor"));
      const closing = fillTemplate(tpl.data?.text.closing ?? "", facts);
      const { data, error } = await supabase
        .from("reference_letters")
        .insert({ person_id: personId, supervisor_person_id: sup.id, status: "requested", facts, intro_text: intro, closing_text: closing } as never)
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("actions").insert({
        title: t("ref.todoTitle").replace("{name}", facts.name),
        source_kind: "reference",
        source_key: (data as { id: string }).id,
        person_id: personId,
        owner: sup.name,
        priority: "normal",
        status: "todo",
      } as never);
      await supabase.from("audit_log").insert({ person_id: personId, action: "Reference letter requested", entity: facts.name, detail: sup.name } as never);
    },
    onSuccess: () => {
      toast.success(t("ref.sent"));
      qc.invalidateQueries({ queryKey: ["reference-letters"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
      onClose();
    },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("ref.request")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("ref.person")}</Label>
            <Select value={personId} onValueChange={pick}>
              <SelectTrigger><SelectValue placeholder={t("ref.pickPerson")} /></SelectTrigger>
              <SelectContent>
                {sorted.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.staff_id ? ` · ${p.staff_id}` : ""}{p.archived ? " (archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {facts && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {FACT_KEYS.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{t(`ref.f.${k}`)}</Label>
                    <Input
                      type={k.endsWith("date") ? "date" : "text"}
                      value={facts[k]}
                      onChange={(e) => updateFact(k, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>{t("ref.supervisor")}</Label>
                <Select value={supId} onValueChange={setSupId}>
                  <SelectTrigger><SelectValue placeholder={t("ref.noSupervisor")} /></SelectTrigger>
                  <SelectContent>
                    {sorted.filter((p) => !p.archived && p.id !== personId).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}{p.is_leader ? " ★" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("ref.intro")}</Label>
                <Textarea rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
                <ConfirmAction
                  title={t("ref.send")}
                  description={t("ref.confirmSend").replace("{name}", sup?.name ?? "—")}
                  onConfirm={() => send.mutate()}
                >
                  <Button disabled={!sup || send.isPending}>{t("ref.send")}</Button>
                </ConfirmAction>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Letter detail --------------------------- */

function LetterDialog({
  letter,
  people,
  onClose,
}: {
  letter: ReferenceLetter;
  people: Map<string, Person>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const growth = useQuery({ queryKey: ["growth-data"], queryFn: fetchGrowthData });
  const isHr = user?.role === "owner" || user?.role === "hr";
  const canWrite = (user?.role === "owner" || user?.role === "manager") && letter.status === "requested";
  const [body, setBody] = useState(letter.supervisor_text ?? "");
  const [closing, setClosing] = useState(letter.closing_text ?? "");
  const [intro, setIntro] = useState(letter.intro_text);
  const [hrNote, setHrNote] = useState(letter.hr_note ?? "");
  const sup = people.get(letter.supervisor_person_id ?? "");

  const ms = (growth.data?.milestones ?? []).filter((m) => m.person_id === letter.person_id);
  const perf = (growth.data?.records ?? []).filter((r) => r.person_id === letter.person_id);

  const update = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("reference_letters").update(patch as never).eq("id", letter.id);
      if (error) throw error;
      if (patch["status"] === "submitted") {
        await supabase.from("actions").update({ status: "done", completed_at: new Date().toISOString() } as never)
          .eq("source_kind", "reference").eq("source_key", letter.id);
      }
      if (patch["status"] === "requested") {
        await supabase.from("actions").update({ status: "todo", completed_at: null } as never)
          .eq("source_kind", "reference").eq("source_key", letter.id);
      }
      return patch["status"] as string | undefined;
    },
    onSuccess: (status) => {
      if (status === "submitted") toast.success(t("ref.submitted"));
      else if (status === "approved") toast.success(t("ref.approved"));
      else if (status === "requested") toast.success(t("ref.returned"));
      else toast.success(t("ref.tpl.saved"));
      qc.invalidateQueries({ queryKey: ["reference-letters"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
      if (status) onClose();
    },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const current: ReferenceLetter = { ...letter, intro_text: intro, supervisor_text: body, closing_text: closing };
  const signer = sup?.name ?? "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("ref.tab")} · {letter.facts.name}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-normal ${statusClass[letter.status] ?? ""}`}>
              {t(`ref.status.${letter.status}`)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              {FACT_KEYS.filter((k) => letter.facts[k]).map((k) => (
                <div key={k}>
                  <p className="text-muted-foreground">{t(`ref.f.${k}`).replace(/（.*）| \(optional\)/, "")}</p>
                  <p className="font-medium">{letter.facts[k]}</p>
                </div>
              ))}
              <div>
                <p className="text-muted-foreground">{t("ref.supervisor")}</p>
                <p className="font-medium">{sup?.name ?? "—"}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("ref.intro")}</Label>
              {isHr && letter.status !== "approved" ? (
                <Textarea rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
              ) : (
                <p className="rounded-md bg-muted/40 p-3 text-sm">{intro}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("ref.body")}</Label>
              {canWrite ? (
                <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("ref.bodyPh")} />
              ) : (
                <p className="min-h-16 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{body || "—"}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("ref.closing")}</Label>
              {canWrite ? (
                <Textarea rows={2} value={closing} onChange={(e) => setClosing(e.target.value)} />
              ) : (
                <p className="rounded-md bg-muted/40 p-3 text-sm">{closing || "—"}</p>
              )}
            </div>
            {isHr && (
              <div className="space-y-1.5">
                <Label>{t("ref.hrNote")}</Label>
                <Textarea rows={2} value={hrNote} onChange={(e) => setHrNote(e.target.value)} />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/40 pt-3">
              {canWrite && (
                <>
                  <Button variant="ghost" onClick={() => update.mutate({ supervisor_text: body, closing_text: closing })}>
                    {t("ref.save")}
                  </Button>
                  <ConfirmAction title={t("ref.submit")} description={t("ref.submit")} onConfirm={() => update.mutate({ supervisor_text: body, closing_text: closing, status: "submitted" })}>
                    <Button disabled={!body.trim() || update.isPending}>{t("ref.submit")}</Button>
                  </ConfirmAction>
                </>
              )}
              {isHr && letter.status === "submitted" && (
                <>
                  <ConfirmAction title={t("ref.sendBack")} description={t("ref.sendBack")} onConfirm={() => update.mutate({ intro_text: intro, hr_note: hrNote, status: "requested" })}>
                    <Button variant="outline">{t("ref.sendBack")}</Button>
                  </ConfirmAction>
                  <ConfirmAction title={t("ref.approve")} description={t("ref.approve")} onConfirm={() => update.mutate({ intro_text: intro, hr_note: hrNote, status: "approved" })}>
                    <Button>{t("ref.approve")}</Button>
                  </ConfirmAction>
                </>
              )}
              {isHr && letter.status !== "submitted" && letter.status !== "approved" && (
                <Button variant="ghost" onClick={() => update.mutate({ intro_text: intro, hr_note: hrNote })}>{t("ref.save")}</Button>
              )}
              {isHr && (letter.status === "approved" || letter.status === "submitted") && (
                <>
                  <Button variant="outline" className="gap-1.5" onClick={() => downloadDocx(current, signer, sup?.offer_title || sup?.appointed_role_title || "").catch((e: unknown) => toast.error(String((e as Error)?.message ?? e)))}>
                    <Download className="size-4" /> {t("ref.word")}
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => downloadPdf(current, signer, sup?.offer_title || sup?.appointed_role_title || "").catch((e: unknown) => toast.error(String((e as Error)?.message ?? e)))}>
                    <Download className="size-4" /> {t("ref.pdf")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <aside className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
            <p className="font-semibold">{t("ref.refInfo")}</p>
            <RefList title={t("ref.promotions")} items={ms.filter((m) => m.kind === "promotion").map((m) => `${m.effective_on} · ${m.title}`)} />
            <RefList title={t("ref.awards")} items={ms.filter((m) => m.kind !== "promotion").map((m) => `${m.effective_on} · ${m.title}`)} />
            <RefList title={t("ref.performance")} items={perf.map((r) => `${r.period} · ${r.rating}${r.summary ? ` — ${r.summary}` : ""}`)} />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RefList({ title, items }: { title: string; items: string[] }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-1 text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground/70">{t("ref.none")}</p>
      ) : (
        <ul className="space-y-1">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}
    </div>
  );
}

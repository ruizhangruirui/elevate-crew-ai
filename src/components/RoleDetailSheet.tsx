import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, UserMinus, Pencil, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { coverageOf, criticalityLabel, type Person, type Role, type Skill } from "@/lib/talent";
import { analyzeRoleFit, generateRoleProfile, type FitResult } from "@/lib/ai.functions";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
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

function TagList({ items, empty }: { items: string[]; empty?: string }) {
  const { t } = useI18n();
  empty = empty ?? t("sheet.pendingFill");
  if (!items.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs text-foreground"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function ProfileBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-raised/40 p-4">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <div className="mt-2">
        <TagList items={items} />
      </div>
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
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [assignSeat, setAssignSeat] = useState<number | null>(null);
  const [fits, setFits] = useState<FitResult[]>([]);
  const runProfile = useServerFn(generateRoleProfile);
  const runFit = useServerFn(analyzeRoleFit);

  const aiProfile = useMutation({
    mutationFn: async () => {
      const draft = await runProfile({ data: { roleId: role!.id } });
      const { error } = await supabase
        .from("roles")
        .update({
          domains: draft.domains,
          knowledge: draft.knowledge,
          leadership: draft.leadership,
          experience: draft.experience,
          skills: draft.skills as unknown as never,
          kpa: draft.kpa,
          recommended_action: draft.recommended_action,
        })
        .eq("id", role!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("sheet.role.aiProfileGenerated"));
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiFit = useMutation({
    mutationFn: () => runFit({ data: { roleId: role!.id } }),
    onSuccess: (rows) => {
      setFits(rows);
      toast.success(t("sheet.role.fitAnalysisDone").replace("{n}", String(rows.length)));
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      toast.success(t("sheet.role.ownerAssigned"));
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
      toast.success(t("sheet.role.ownerRemoved"));
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
          <SheetDescription>{t("sheet.role.headerDesc").replace("{direction}", directionTitle)}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-10">
          <Module
            title={t("sheet.role.profile")}
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
                <ConfirmAction
                  title={t("sheet.role.confirmRegenTitle")}
                  description={
                    <>
                      <p>{t("sheet.role.confirmRegenDesc1")}</p>
                      <p>{t("sheet.role.confirmRegenDesc2")}</p>
                    </>
                  }
                  confirmLabel={t("sheet.role.confirmRegenLabel")}
                  onConfirm={() => aiProfile.mutate()}
                >
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={aiProfile.isPending}>
                    {aiProfile.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {t("sheet.role.aiGenerateProfile")}
                  </Button>
                </ConfirmAction>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing((v) => !v)}>
                  <Pencil className="size-3.5" /> {editing ? t("sheet.cancel") : t("sheet.role.editProfile")}
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
                  {role.description || t("sheet.role.noDescription")}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Fact label={t("sheet.role.direction")} value={directionTitle} />
                  <Fact label={t("sheet.role.targetLevel")} value={`${role.level_min}–${role.level_max}`} />
                  <Fact label={t("sheet.role.targetCount")} value={role.target_count} />
                  <Fact label={t("sheet.role.currentCoverage")} value={`${cov.filled}/${role.target_count}`} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ProfileBlock title={t("sheet.role.domains")} items={role.domains} />
                  <ProfileBlock title={t("sheet.role.knowledge")} items={role.knowledge} />
                  <ProfileBlock title="Leadership" items={role.leadership} />
                  <ProfileBlock title={t("sheet.role.experience")} items={role.experience} />
                </div>

                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t("sheet.role.skillRequirements")}</p>
                  {role.skills.length ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {role.skills.map((s) => (
                        <div
                          key={s.skill}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2 text-sm"
                        >
                          <span className="text-muted-foreground">{s.skill}</span>
                          <strong className="font-display">{s.level}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{t("sheet.pendingFill")}</p>
                  )}
                </div>
              </>
            )}
          </Module>

          <Module
            title={t("sheet.role.currentCoverageTitle")}
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
                    <strong className="text-sm">{t("sheet.role.seat").replace("{n}", String(i + 1))}</strong>
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
                      <ConfirmAction
                        title={t("sheet.role.confirmRemoveOwnerTitle").replace("{name}", owner.name)}
                        description={
                          <>
                            <p>{t("sheet.role.confirmRemoveOwnerDesc1")}</p>
                            <p>{t("sheet.role.confirmRemoveOwnerDesc2")}</p>
                          </>
                        }
                        confirmLabel={t("sheet.role.confirmRemoveLabel")}
                        onConfirm={() => unassign.mutate(owner.id)}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground hover:text-danger"
                        >
                          <UserMinus className="size-3.5" /> {t("sheet.role.removeOwner")}
                        </Button>
                      </ConfirmAction>
                    </div>
                  ) : assignSeat === i ? (
                    <div className="mt-3 flex gap-2">
                      <Select onValueChange={(v) => assign.mutate(v)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={t("sheet.role.selectPerson")} />
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
                        {t("sheet.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        {t("sheet.role.vacantHint")}
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

          <Module title={t("sheet.role.gapRiskKpaAction")}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                label="Gap"
                value={cov.gap ? t("sheet.role.gapCount").replace("{n}", String(cov.gap)) : t("sheet.role.noCriticalGap")}
              />
              <Fact label="Risk" value={risk} />
              <Fact label="KPA" value={role.kpa || t("sheet.pendingFill")} />
              <Fact
                label="Action"
                value={role.recommended_action.length ? role.recommended_action.join(" / ") : t("sheet.pendingFill")}
              />
            </div>
          </Module>

          <Module title={t("sheet.role.aiAssist")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand/5 p-4">
              <p className="text-xs text-muted-foreground">
                {t("sheet.role.aiAssistDesc")}
              </p>
              <Button size="sm" className="gap-1.5" disabled={aiFit.isPending} onClick={() => aiFit.mutate()}>
                {aiFit.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {aiFit.isPending ? t("sheet.role.analyzing") : t("sheet.role.aiFitAnalysis")}
              </Button>
            </div>

            {fits.length > 0 && (
              <div className="mb-4 space-y-3">
                {fits.map((f) => (
                  <div key={f.person_id} className="rounded-xl border border-border/60 bg-surface-raised/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{f.person_name}</strong>
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-medium tabular-nums ${
                          f.fit_score >= 75
                            ? "bg-ok/12 text-ok"
                            : f.fit_score >= 50
                              ? "bg-warn/12 text-warn"
                              : "bg-danger/12 text-danger"
                        }`}
                      >
                        {t("sheet.role.fitScore").replace("{n}", String(f.fit_score))}
                      </span>
                    </div>
                    <Progress value={f.fit_score} className="mt-3 h-1.5" />
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{f.summary}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-ok">{t("sheet.role.strengths")}</p>
                        <div className="mt-1.5">
                          <TagList items={f.strengths} empty="—" />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-danger">{t("sheet.role.gaps")}</p>
                        <div className="mt-1.5">
                          <TagList items={f.gaps} empty="—" />
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {t("sheet.role.developmentSuggestion").replace("{text}", f.recommendation)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: t("sheet.role.currentJudgment"),
                  s: coverageLabel,
                  d:
                    cov.state === "empty"
                      ? t("sheet.role.emptyStateDesc")
                      : cov.state === "partial"
                        ? t("sheet.role.partialStateDesc")
                        : t("sheet.role.fullStateDesc"),
                },
                {
                  title: t("sheet.role.coreEvidence"),
                  s: t("sheet.role.seatsCovered").replace("{filled}", String(cov.filled)).replace("{target}", String(role.target_count)),
                  d: owners.length
                    ? t("sheet.role.onboardList").replace("{names}", owners.map((o) => o.name).join("、"))
                    : t("sheet.role.noOwnerRecord"),
                },
                {
                  title: t("sheet.role.recommendedAction"),
                  s: role.recommended_action[0] ?? (cov.gap ? t("sheet.role.startKpa") : t("sheet.role.keepQuarterlyReview")),
                  d: cov.gap ? t("sheet.role.gapActionDesc") : t("sheet.role.noGapActionDesc"),
                },
              ].map((c) => (
                <article key={c.title} className="rounded-xl border border-border/60 bg-surface-raised/40 p-4">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{c.title}</p>
                  <p className="mt-1 font-display text-sm font-semibold">{c.s}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.d}</p>
                </article>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{t("sheet.role.aiFootnote")}</p>
          </Module>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const toLines = (items: string[]) => items.join("\n");
const fromLines = (v: string) =>
  v
    .split(/[\n,、]/)
    .map((s) => s.trim())
    .filter(Boolean);

function EditRoleForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: role.title,
    description: role.description ?? "",
    level_min: String(role.level_min),
    level_max: String(role.level_max),
    target_count: String(role.target_count),
    criticality: role.criticality,
    domains: toLines(role.domains),
    knowledge: toLines(role.knowledge),
    leadership: toLines(role.leadership),
    experience: toLines(role.experience),
    skills: role.skills.map((s) => `${s.skill}: ${s.level}`).join("\n"),
    kpa: role.kpa ?? "",
    recommended_action: toLines(role.recommended_action),
  });

  const save = useMutation({
    mutationFn: async () => {
      const skills: Skill[] = fromLines(form.skills.replace(/,/g, "\n")).map((line) => {
        const [skill, level] = line.split(/[:：]/);
        return { skill: (skill ?? "").trim(), level: (level ?? "Advanced").trim() };
      });
      const { error } = await supabase
        .from("roles")
        .update({
          title: form.title,
          description: form.description,
          level_min: Number(form.level_min),
          level_max: Number(form.level_max),
          target_count: Number(form.target_count),
          criticality: form.criticality,
          domains: fromLines(form.domains),
          knowledge: fromLines(form.knowledge),
          leadership: fromLines(form.leadership),
          experience: fromLines(form.experience),
          skills: skills as unknown as never,
          kpa: form.kpa || null,
          recommended_action: fromLines(form.recommended_action),
        })
        .eq("id", role.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("sheet.role.profileUpdated"));
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("sheet.role.editRoleName")}</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>{t("sheet.role.editRoleDesc")}</Label>
        <Textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>{t("sheet.role.editMinLevel")}</Label>
          <Input
            type="number"
            value={form.level_min}
            onChange={(e) => setForm({ ...form, level_min: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("sheet.role.editMaxLevel")}</Label>
          <Input
            type="number"
            value={form.level_max}
            onChange={(e) => setForm({ ...form, level_max: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("sheet.role.editTargetCount")}</Label>
          <Input
            type="number"
            value={form.target_count}
            onChange={(e) => setForm({ ...form, target_count: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("sheet.role.editCriticality")}</Label>
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
      {(
        [
          ["domains", t("sheet.role.domains")],
          ["knowledge", t("sheet.role.knowledge")],
          ["leadership", "Leadership"],
          ["experience", t("sheet.role.experience")],
          ["recommended_action", t("sheet.role.recommendedAction")],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="space-y-2">
          <Label>
            {label} <span className="text-xs text-muted-foreground">{t("sheet.role.perLineHint")}</span>
          </Label>
          <Textarea
            rows={2}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </div>
      ))}
      <div className="space-y-2">
        <Label>
          {t("sheet.role.skillRequirementsHint")} <span className="text-xs text-muted-foreground">{t("sheet.role.skillLineHint")}</span>
        </Label>
        <Textarea
          rows={3}
          placeholder={"NPU Dataflow: Expert\nCompiler: Advanced"}
          value={form.skills}
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>KPA</Label>
        <Input value={form.kpa} onChange={(e) => setForm({ ...form, kpa: e.target.value })} />
      </div>
      <Button onClick={() => save.mutate()} disabled={!form.title.trim() || save.isPending}>
        {t("sheet.save")}
      </Button>
    </div>
  );
}
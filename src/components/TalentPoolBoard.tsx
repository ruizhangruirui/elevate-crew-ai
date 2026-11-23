import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ChevronDown, ExternalLink, FileUp, Linkedin, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmAction } from "@/components/ConfirmAction";
import { analyzeTalent, deleteTalent, listTalentPool, saveTalent, syncTalentFromTeamTailor, uploadTalentCv } from "@/lib/talent-pool.functions";
import type { TalentRow } from "@/lib/talent-pool";

const PAGE = 20;
const scoreTone = (s: number | null) =>
  s == null ? "bg-muted text-muted-foreground" : s >= 75 ? "bg-ok/15 text-ok" : s >= 50 ? "bg-brand/15 text-brand" : "bg-warn/15 text-warn";

export function TalentPoolBoard() {
  const { lang } = useI18n();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const qc = useQueryClient();
  const list = useServerFn(listTalentPool);
  const sync = useServerFn(syncTalentFromTeamTailor);
  const analyze = useServerFn(analyzeTalent);
  const save = useServerFn(saveTalent);
  const del = useServerFn(deleteTalent);
  const { data, isLoading, error } = useQuery({ queryKey: ["talent-pool"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [minScore, setMinScore] = useState("0");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<TalentRow | "new" | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["talent-pool"] });

  const syncM = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => { toast.success(l(`TeamTailor：新增 ${r.imported}，更新 ${r.updated}`, `TeamTailor: ${r.imported} added, ${r.updated} updated`) + (r.capped ? l("（达到分页上限）", " (page cap reached)") : "")); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAnalyze = async (id: string) => {
    setBusy(id);
    try {
      const r = await analyze({ data: { id, lang } });
      toast.success(l(`AI 分析完成：${r.ai_score} 分`, `AI analysis done: ${r.ai_score}`) + (r.usedCv ? "" : l("（无简历，仅依据资料）", " (no CV, profile only)")));
      refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.talents ?? [])
      .filter((t) => t.archived === showArchived)
      .filter((t) => source === "all" || t.source === source)
      .filter((t) => (t.ai_score ?? 0) >= Number(minScore))
      .filter((t) => roleFilter === "all" || t.ai_role_matches.some((m) => m.role_id === roleFilter))
      .filter((t) => !s || [t.name, t.email, t.headline, t.location, ...t.tags, ...t.ai_directions.map((d) => d.direction)].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
  }, [data, q, source, minScore, roleFilter, showArchived]);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  return (
    <section className="space-y-3">
      <div className="card-glass flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={l("搜索姓名、方向、标签…", "Search name, direction, tag…")} className="h-9 w-56 pl-8 text-sm" />
        </div>
        <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{l("全部来源", "All sources")}</SelectItem>
            <SelectItem value="TeamTailor">TeamTailor</SelectItem>
            <SelectItem value="Manual">{l("手工添加", "Manual")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{l("全部开放岗位", "All open positions")}</SelectItem>
            {(data?.openRoles ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={minScore} onValueChange={(v) => { setMinScore(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["0", "50", "65", "75", "85"].map((s) => <SelectItem key={s} value={s}>{s === "0" ? l("任意分数", "Any score") : `≥ ${s}`}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => { setShowArchived(!showArchived); setPage(0); }}>
          <Archive className="mr-1 h-4 w-4" />{showArchived ? l("查看在库", "Show active") : l("查看已归档", "Show archived")}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={syncM.isPending} onClick={() => syncM.mutate()}>
            <RefreshCw className={`mr-1 h-4 w-4 ${syncM.isPending ? "animate-spin" : ""}`} />{l("从 TeamTailor 同步", "Sync from TeamTailor")}
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />{l("添加人才", "Add talent")}</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{l(`共 ${rows.length} 人`, `${rows.length} people`)}</p>
      {isLoading && <p className="text-sm text-muted-foreground">{l("加载中…", "Loading…")}</p>}

      <div className="space-y-2">
        {pageRows.map((t) => {
          const isOpen = open === t.id;
          return (
            <article key={t.id} className="card-glass overflow-hidden">
              <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${scoreTone(t.ai_score)}`}>{t.ai_score ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[t.headline, t.location].filter(Boolean).join(" · ") || t.email || "—"}
                  </span>
                </span>
                <span className="hidden max-w-[40%] flex-wrap justify-end gap-1 md:flex">
                  {t.ai_directions.slice(0, 2).map((d) => <span key={d.direction} className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">{d.direction}</span>)}
                  {t.ai_role_matches[0] && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">→ {t.ai_role_matches[0].role_title}</span>}
                </span>
                <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.source === "Manual" ? l("手工", "Manual") : t.source}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="grid gap-4 border-t border-border/60 p-4 md:grid-cols-[1fr_1.3fr]">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {t.email && <a className="text-brand hover:underline" href={`mailto:${t.email}`}>{t.email}</a>}
                      {t.phone && <span>{t.phone}</span>}
                      {t.linkedin_url && <a className="inline-flex items-center gap-1 text-brand hover:underline" href={t.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-3 w-3" />LinkedIn</a>}
                      {t.cv_url && <a className="inline-flex items-center gap-1 text-brand hover:underline" href={t.cv_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />CV</a>}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.has_cv_text ? l("已有简历文字，可用于 AI 分析", "CV text available for AI") : l("暂无简历文字", "No CV text yet")}</p>
                    {t.tags.length > 0 && <div className="flex flex-wrap gap-1">{t.tags.map((g) => <span key={g} className="rounded bg-muted px-1.5 py-0.5 text-xs">{g}</span>)}</div>}
                    {t.notes && <p className="whitespace-pre-line text-xs">{t.notes}</p>}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" disabled={busy === t.id} onClick={() => runAnalyze(t.id)}>
                        <Sparkles className={`mr-1 h-4 w-4 ${busy === t.id ? "animate-pulse" : ""}`} />{busy === t.id ? l("分析中…", "Analyzing…") : t.ai_analyzed_at ? l("重新 AI 分析", "Re-run AI") : l("AI 分析", "AI analyze")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(t)}>{l("编辑", "Edit")}</Button>
                      <ConfirmAction
                        title={t.archived ? l("恢复该人才？", "Restore this talent?") : l("归档该人才？", "Archive this talent?")}
                        description={l("可随时恢复。", "You can undo this anytime.")}
                        onConfirm={async () => { try { await save({ data: { id: t.id, name: t.name, archived: !t.archived } }); toast.success(l("已更新", "Updated")); refresh(); } catch (e) { toast.error((e as Error).message); } }}
                      >
                        <Button size="sm" variant="ghost"><Archive className="mr-1 h-4 w-4" />{t.archived ? l("恢复", "Restore") : l("归档", "Archive")}</Button>
                      </ConfirmAction>
                      {data?.canDelete && (
                        <ConfirmAction
                          title={l("永久删除该人才？", "Permanently delete this talent?")}
                          description={l("资料与 AI 分析将被删除，无法恢复。", "Profile and AI analysis will be deleted and cannot be recovered.")}
                          confirmLabel={l("删除", "Delete")}
                          onConfirm={async () => { try { await del({ data: { id: t.id } }); toast.success(l("已删除", "Deleted")); refresh(); } catch (e) { toast.error((e as Error).message); } }}
                        >
                          <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="mr-1 h-4 w-4" />{l("删除", "Delete")}</Button>
                        </ConfirmAction>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    {!t.ai_analyzed_at ? (
                      <p className="text-xs text-muted-foreground">{l("尚未 AI 分析。", "Not analyzed yet.")}</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">AI · {formatDate(t.ai_analyzed_at)}</p>
                        {t.ai_summary && <p>{t.ai_summary}</p>}
                        <div className="grid grid-cols-4 gap-2">
                          {(["education", "experience", "projects", "skills"] as const).map((k) => (
                            <div key={k} className="rounded-md bg-muted/50 p-2 text-center">
                              <div className="text-base font-semibold">{t.ai_breakdown[k] ?? "—"}</div>
                              <div className="text-[10px] text-muted-foreground">{{ education: l("教育", "Education"), experience: l("工作经历", "Experience"), projects: l("项目", "Projects"), skills: l("技能", "Skills") }[k]}</div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <h4 className="mb-1 text-xs font-semibold">{l("适合方向", "Suitable directions")}</h4>
                          <ul className="space-y-1">{t.ai_directions.map((d) => <li key={d.direction} className="text-xs"><span className="font-medium text-brand">{d.direction}</span> — {d.reason}</li>)}</ul>
                        </div>
                        <div>
                          <h4 className="mb-1 text-xs font-semibold">{l("匹配的开放岗位", "Matching open positions")}</h4>
                          {t.ai_role_matches.length === 0 ? <p className="text-xs text-muted-foreground">{l("暂无明显匹配", "No strong match")}</p> : (
                            <ul className="space-y-1">{t.ai_role_matches.map((m) => <li key={m.role_id} className="text-xs"><span className={`mr-1 rounded px-1.5 py-0.5 font-semibold ${scoreTone(m.fit_score)}`}>{m.fit_score}</span><span className="font-medium">{m.role_title}</span> — {m.reason}</li>)}</ul>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>{l("上一页", "Prev")}</Button>
          <span>{page + 1} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{l("下一页", "Next")}</Button>
        </div>
      )}

      {editing && <TalentDialog talent={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </section>
  );
}

function TalentDialog({ talent, onClose, onSaved }: { talent: TalentRow | null; onClose: () => void; onSaved: () => void }) {
  const { lang } = useI18n();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const save = useServerFn(saveTalent);
  const upload = useServerFn(uploadTalentCv);
  const [f, setF] = useState({
    name: talent?.name ?? "", email: talent?.email ?? "", phone: talent?.phone ?? "", location: talent?.location ?? "",
    linkedin_url: talent?.linkedin_url ?? "", cv_url: talent?.cv_url ?? "", headline: talent?.headline ?? "",
    notes: talent?.notes ?? "", tags: (talent?.tags ?? []).join(", "), cv_text: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (!f.name.trim()) { toast.error(l("请填写姓名", "Name is required")); return; }
    if (file && file.size > 10 * 1024 * 1024) { toast.error(l("PDF 不能超过 10 MB", "PDF must be 10 MB or smaller")); return; }
    setSaving(true);
    try {
      const { cv_text, tags, ...rest } = f;
      const { id } = await save({ data: { ...(talent ? { id: talent.id } : {}), ...rest, tags: tags.split(",").map((s) => s.trim()).filter(Boolean), ...(cv_text.trim() ? { cv_text } : {}) } });
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        await upload({ data: { id, base64: btoa(bin) } });
      }
      toast.success(talent ? l("已保存", "Saved") : l("已添加到人才库", "Added to talent pool"));
      onSaved();
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{talent ? l("编辑人才", "Edit talent") : l("添加人才", "Add talent")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>{l("姓名", "Name")} *</Label><Input value={f.name} onChange={set("name")} /></div>
          <div className="sm:col-span-2"><Label>{l("一句话简介", "Headline")}</Label><Input value={f.headline} onChange={set("headline")} placeholder={l("例如：PhD 计算机视觉，5 年工业经验", "e.g. PhD in computer vision, 5 years in industry")} /></div>
          <div><Label>Email</Label><Input value={f.email} onChange={set("email")} /></div>
          <div><Label>{l("电话", "Phone")}</Label><Input value={f.phone} onChange={set("phone")} /></div>
          <div><Label>{l("地点", "Location")}</Label><Input value={f.location} onChange={set("location")} /></div>
          <div><Label>LinkedIn</Label><Input value={f.linkedin_url} onChange={set("linkedin_url")} /></div>
          <div className="sm:col-span-2"><Label>{l("CV 链接", "CV link")}</Label><Input value={f.cv_url} onChange={set("cv_url")} /></div>
          <div className="sm:col-span-2"><Label>{l("标签（逗号分隔）", "Tags (comma separated)")}</Label><Input value={f.tags} onChange={set("tags")} /></div>
          <div className="sm:col-span-2"><Label>{l("备注", "Notes")}</Label><Textarea rows={3} value={f.notes} onChange={set("notes")} /></div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1"><FileUp className="h-4 w-4" />{l("上传 PDF 简历（用于 AI 分析）", "Upload PDF CV (for AI analysis)")}</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="sm:col-span-2">
            <Label>{l("或粘贴简历文字", "Or paste CV text")}</Label>
            <Textarea rows={4} value={f.cv_text} onChange={set("cv_text")} placeholder={talent?.has_cv_text ? l("已有简历文字；粘贴新内容会替换", "CV text exists; pasting replaces it") : ""} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{l("取消", "Cancel")}</Button>
          <Button disabled={saving} onClick={submit}>{saving ? l("保存中…", "Saving…") : l("保存", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

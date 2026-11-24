import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Briefcase, History, Check, ChevronDown, ExternalLink, FileUp, FolderCog, GraduationCap, Linkedin, MapPin, Pencil, Plus, RefreshCw, Search, Sparkles, Square, Tag, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmAction } from "@/components/ConfirmAction";
import { analyzeTalent, deleteTalent, renameTalentCategory, saveTalentCategoryCatalog, setTalentCategory, listTalentPool, saveTalent, syncTalentFromTeamTailor, uploadTalentCv } from "@/lib/talent-pool.functions";
import type { AiProvider } from "@/lib/ai.functions";
import { AiProviderSelect } from "@/components/AiProviderSelect";
import type { TalentRow } from "@/lib/talent-pool";
import { QS_EDITION, talentHighlights } from "@/lib/talent-highlights";

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
  const setCat = useServerFn(setTalentCategory);
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);
  const stopRef = useRef(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["talent-pool"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [minScore, setMinScore] = useState("0");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<TalentRow | "new" | null>(null);
  const [manageCats, setManageCats] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProvider | undefined>(undefined);
  const refresh = () => qc.invalidateQueries({ queryKey: ["talent-pool"] });

  const syncM = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => { toast.success(l(`TeamTailor：新增 ${r.imported}，更新 ${r.updated}`, `TeamTailor: ${r.imported} added, ${r.updated} updated`) + (r.capped ? l("（达到分页上限）", " (page cap reached)") : "")); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAnalyze = async (id: string) => {
    setBusy(id);
    try {
      const r = await analyze({ data: { id, lang, provider: aiProvider } });
      toast.success(l(`AI 分析完成：${r.ai_score} 分`, `AI analysis done: ${r.ai_score}`) + (r.usedCv ? "" : l("（无简历，仅依据资料）", " (no CV, profile only)")));
      refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.talents ?? [])
      .filter((t) => t.archived === showArchived)
      .filter((t) => category === "all" || (category === "__none" ? !t.category : t.category === category))
      .filter((t) => source === "all" || t.source === source)
      .filter((t) => (t.ai_score ?? 0) >= Number(minScore))
      .filter((t) => roleFilter === "all" || t.ai_role_matches.some((m) => m.role_id === roleFilter))
      .filter((t) => !s || [t.name, t.email, t.headline, t.location, t.current_title, t.current_company, ...(t.previous_companies ?? []), ...(t.education ?? []), ...(t.previous_roles ?? []), ...t.tags, ...t.teamtailor_applied_jobs, ...t.ai_directions.map((d) => d.direction)].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
  }, [data, q, source, minScore, roleFilter, showArchived, category]);
  const categories = useMemo(() => {
    const used = (data?.talents ?? []).map((t) => t.category).filter((c): c is string => !!c);
    return [...new Set([...(data?.categoryCatalog ?? []), ...used])].sort();
  }, [data]);

  /** Sequential bulk analysis (one call at a time, shared AI rate limit); stops on credit/permission errors. */
  const runBulk = async (onlyNew: boolean) => {
    const targets = rows.filter((t) => (selected.size ? selected.has(t.id) : true) && (!onlyNew || !t.ai_analyzed_at));
    if (!targets.length) { toast.info(l("没有需要分析的人", "Nobody to analyze")); return; }
    stopRef.current = false;
    let failed = 0;
    setBulk({ done: 0, total: targets.length, failed: 0 });
    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) break;
      try { await analyze({ data: { id: targets[i]!.id, lang, provider: aiProvider } }); }
      catch (e) {
        failed++;
        const msg = (e as Error).message;
        if (/额度|credit|402|403|未配置|configured/i.test(msg)) { toast.error(msg); break; }
      }
      setBulk({ done: i + 1, total: targets.length, failed });
      if ((i + 1) % 5 === 0) refresh();
    }
    refresh();
    toast.success(l(`批量分析结束，失败 ${failed} 人（多为缺少简历）`, `Bulk analysis finished, ${failed} failed (usually no CV)`));
    setBulk(null);
  };
  const applyCategory = async (ids: string[], cat: string | null) => {
    try { await setCat({ data: { ids, category: cat } }); toast.success(l("分类已更新", "Category updated")); setSelected(new Set()); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  return (
    <section className="space-y-3">
      <div className="card-glass flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={l("搜索姓名、公司、学校、学位、职位…", "Search name, company, school, degree, title…")} className="h-9 w-56 pl-8 text-sm" />
        </div>
        <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{l("全部来源", "All sources")}</SelectItem>
            <SelectItem value="TeamTailor">TeamTailor</SelectItem>
            <SelectItem value="Manual">{l("手工添加", "Manual")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{l("全部分类", "All categories")}</SelectItem>
            <SelectItem value="__none">{l("未分类", "Uncategorized")}</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setManageCats(true)}>
          <FolderCog className="mr-1 h-4 w-4" />{l("管理分类", "Manage categories")}
        </Button>
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

      <div className="card-glass flex flex-wrap items-center gap-2 p-3">
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="text-sm font-medium">{l("批量 AI 分析", "Bulk AI analysis")}</span>
        <AiProviderSelect value={aiProvider} onChange={setAiProvider} />
        <span className="text-xs text-muted-foreground">{selected.size ? l(`已选 ${selected.size} 人`, `${selected.size} selected`) : l(`当前筛选 ${rows.length} 人`, `${rows.length} in current filter`)}</span>
        {bulk ? (
          <>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand transition-all" style={{ width: `${(bulk.done / bulk.total) * 100}%` }} /></div>
            <span className="text-xs">{bulk.done} / {bulk.total}{bulk.failed ? l(` · 失败 ${bulk.failed}`, ` · ${bulk.failed} failed`) : ""}</span>
            <Button size="sm" variant="outline" onClick={() => { stopRef.current = true; }}><Square className="mr-1 h-3 w-3" />{l("停止", "Stop")}</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => runBulk(true)}>{l("分析未分析的", "Analyze new only")}</Button>
            <ConfirmAction title={l("全部重新分析？", "Re-analyze all?")} description={l(`将逐个重新分析 ${selected.size || rows.length} 人，会消耗 AI 额度。`, `Re-analyzes ${selected.size || rows.length} people one by one and uses AI credits.`)} onConfirm={() => runBulk(false)}>
              <Button size="sm" variant="outline">{l("全部重新分析", "Re-analyze all")}</Button>
            </ConfirmAction>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <Input list="talent-cats" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} placeholder={l("分类名称", "Category name")} className="h-8 w-40 text-xs" />
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => applyCategory([...selected], bulkCat.trim() || null)}>{l("设为所选分类", "Set for selected")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(selected.size ? new Set() : new Set(pageRows.map((t) => t.id)))}>{selected.size ? l("取消选择", "Clear") : l("全选本页", "Select page")}</Button>
        </div>
        <datalist id="talent-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </div>

      <p className="text-xs text-muted-foreground">{l(`共 ${rows.length} 人`, `${rows.length} people`)}</p>
      {isLoading && <p className="text-sm text-muted-foreground">{l("加载中…", "Loading…")}</p>}

      <div className="space-y-2">
        {pageRows.map((t) => {
          const isOpen = open === t.id;
          const highlights = talentHighlights(t);
          const highlightLabel = (h: (typeof highlights)[number]) => h.kind === "qs" ? `QS ${QS_EDITION} Top 20 · ${h.institution}` : h.kind === "phd_candidate" ? l("博士在读", "PhD candidate") : l("博士 · PhD", "PhD");
          return (
            <article key={t.id} className="card-glass overflow-hidden">
              <div className="flex items-center pl-3">
              <input type="checkbox" aria-label={t.name} className="h-4 w-4 accent-[var(--color-brand)]" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${scoreTone(t.ai_score)}`}>{t.ai_score ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  {(() => {
                    const edu = t.education ?? [];
                    const now = [t.current_title || t.headline, t.current_company].filter(Boolean).join(" · ");
                    const prev = (t.previous_roles ?? []).length ? t.previous_roles! : (t.previous_companies ?? []);
                    return <span className="mt-1 block space-y-0.5 text-xs">
                      {edu.length > 0 && <span className="flex min-w-0 items-center gap-1.5 text-brand"><GraduationCap className="h-3.5 w-3.5 shrink-0" /><span className="truncate font-medium">{edu.join("  |  ")}</span></span>}
                      {now && <span className="flex min-w-0 items-center gap-1.5 text-foreground"><Briefcase className="h-3.5 w-3.5 shrink-0 text-ok" /><span className="truncate font-semibold">{now}</span></span>}
                      {prev.length > 0 && <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><History className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{prev.join("  |  ")}</span></span>}
                    </span>;
                  })()}
                  {highlights.length > 0 && <span className="my-1 flex flex-wrap gap-1.5">
                    {highlights.map((h) => <span key={`${h.kind}-${h.institution ?? ""}`} title={`${h.source === "ai" ? l("AI 摘要，待核实", "AI summary, unverified") : l("资料提及，待核实", "Profile mention, unverified")}: ${h.evidence}`} className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${h.kind === "qs" ? "border-warn/30 bg-warn/10 text-warn" : "border-brand/30 bg-brand/10 text-brand"}`}><GraduationCap className="h-3.5 w-3.5 shrink-0" /><span className="break-words">{highlightLabel(h)}{h.source === "ai" ? " · AI" : ""}</span></span>)}
                  </span>}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                        {t.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{t.location}</span>}
                    {t.linkedin_url && <a onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-brand hover:underline" href={t.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-3 w-3" />LinkedIn</a>}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${t.contracted ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground"}`}>{t.contracted ? l("已联系", "Contacted") : l("未联系", "Not contacted")}</span>
                  </span>
                </span>
                <span className="hidden max-w-[40%] flex-wrap justify-end gap-1 md:flex">
                  {t.ai_directions.slice(0, 3).map((d) => <span key={d.direction} title={d.reason} className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">{d.direction}</span>)}
                </span>
                {t.category && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">{t.category}</span>}
                <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.source === "Manual" ? l("手工", "Manual") : t.source}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              </div>
              {isOpen && (
                <div className="grid gap-4 border-t border-border/60 p-4 md:grid-cols-[1fr_1.3fr]">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {t.cv_url && <a className="inline-flex items-center gap-1 text-brand hover:underline" href={t.cv_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />CV</a>}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold">{l("TeamTailor 实际投递岗位", "TeamTailor applied positions")}</h4>
                      {t.teamtailor_applied_jobs.length > 0 ? <ul className="space-y-1">{t.teamtailor_applied_jobs.map((title) => <li key={title} className="break-words text-xs text-brand">{title}</li>)}</ul> : <p className="text-xs text-muted-foreground">{l("暂无同步的投递岗位记录", "No synced application records")}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.has_cv_text ? l("已有简历文字，可用于 AI 分析", "CV text available for AI") : l("暂无简历文字", "No CV text yet")}</p>
                    {highlights.length > 0 && <div className="space-y-1 border-l-2 border-brand/40 pl-2">
                      {highlights.map((h) => <p key={`${h.kind}-${h.institution ?? ""}`} className="break-words text-xs"><span className="font-semibold text-brand">{highlightLabel(h)}</span><span className="text-muted-foreground"> · {h.source === "ai" ? l("AI 摘要，待核实", "AI summary, unverified") : l("资料提及，待核实", "Profile mention, unverified")}</span><span className="mt-0.5 block text-muted-foreground">{h.evidence}</span></p>)}
                    </div>}
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
      {manageCats && (
        <ManageCategoriesDialog
          categories={categories}
          counts={(data?.talents ?? []).reduce<Record<string, number>>((m, t) => { if (t.category) m[t.category] = (m[t.category] ?? 0) + 1; return m; }, {})}
          onClose={() => setManageCats(false)}
          onChanged={refresh}
        />
      )}
    </section>
  );
}

function ManageCategoriesDialog({ categories, counts, onClose, onChanged }: { categories: string[]; counts: Record<string, number>; onClose: () => void; onChanged: () => void }) {
  const { lang } = useI18n();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const rename = useServerFn(renameTalentCategory);
  const saveCatalog = useServerFn(saveTalentCategoryCatalog);
  const [newCat, setNewCat] = useState("");
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);

  const persistCatalog = async (next: string[]) => {
    await saveCatalog({ data: { categories: next } });
  };
  const add = async () => {
    const name = newCat.trim();
    if (!name) return;
    if (categories.includes(name)) { toast.info(l("分类已存在", "Category already exists")); return; }
    setBusy(true);
    try { await persistCatalog([...categories, name]); setNewCat(""); toast.success(l("分类已添加", "Category added")); onChanged(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const doRename = async (from: string) => {
    const to = editValue.trim();
    setEditingCat(null);
    if (!to || to === from) return;
    if (categories.includes(to)) { toast.error(l("目标分类已存在", "Target category already exists")); return; }
    setBusy(true);
    try {
      await rename({ data: { from, to } });
      await persistCatalog(categories.map((c) => (c === from ? to : c)));
      toast.success(l("分类已重命名", "Category renamed"));
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (name: string) => {
    setBusy(true);
    try {
      await rename({ data: { from: name, to: null } });
      await persistCatalog(categories.filter((c) => c !== name));
      toast.success(l("分类已删除，相关人员已移出该分类", "Category deleted; its people are now uncategorized"));
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{l("管理分类", "Manage categories")}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={l("新分类名称", "New category name")} className="h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button size="sm" disabled={busy || !newCat.trim()} onClick={add}><Plus className="mr-1 h-4 w-4" />{l("添加", "Add")}</Button>
        </div>
        {categories.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{l("还没有分类，先在上方添加一个。", "No categories yet — add one above.")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {categories.map((c) => (
              <li key={c} className="flex items-center gap-2 py-2">
                {editingCat === c ? (
                  <>
                    <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 flex-1 text-sm" onKeyDown={(e) => { if (e.key === "Enter") doRename(c); if (e.key === "Escape") setEditingCat(null); }} />
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => doRename(c)} aria-label={l("确认", "Confirm")}><Check className="h-4 w-4 text-ok" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCat(null)} aria-label={l("取消", "Cancel")}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm font-medium">{c}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{l(`${counts[c] ?? 0} 人`, `${counts[c] ?? 0}`)}</span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditingCat(c); setEditValue(c); }} aria-label={l("重命名", "Rename")}><Pencil className="h-4 w-4" /></Button>
                    <ConfirmAction
                      title={l(`删除分类「${c}」？`, `Delete category "${c}"?`)}
                      description={l(`该分类下的 ${counts[c] ?? 0} 人会变为未分类，人员资料不会被删除。`, `${counts[c] ?? 0} people in it become uncategorized; their profiles are kept.`)}
                      confirmLabel={l("删除", "Delete")}
                      onConfirm={() => remove(c)}
                    >
                      <Button size="sm" variant="ghost" className="text-destructive" aria-label={l("删除", "Delete")}><Trash2 className="h-4 w-4" /></Button>
                    </ConfirmAction>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{l("关闭", "Close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    current_company: talent?.current_company ?? "", notes: talent?.notes ?? "", category: talent?.category ?? "", tags: (talent?.tags ?? []).join(", "), cv_text: "",
  });
  const [contracted, setContracted] = useState<boolean>(talent?.contracted ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (!f.name.trim()) { toast.error(l("请填写姓名", "Name is required")); return; }
    if (file && file.size > 10 * 1024 * 1024) { toast.error(l("PDF 不能超过 10 MB", "PDF must be 10 MB or smaller")); return; }
    setSaving(true);
    try {
      const { cv_text, tags, ...rest } = f;
      const { id } = await save({ data: { ...(talent ? { id: talent.id } : {}), ...rest, contracted, tags: tags.split(",").map((s) => s.trim()).filter(Boolean), ...(cv_text.trim() ? { cv_text } : {}) } });
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
          <div><Label>{l("当前公司", "Current company")}</Label><Input value={f.current_company} onChange={set("current_company")} /></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={contracted} onChange={(e) => setContracted(e.target.checked)} />{l("已联系", "Contacted")}</label>
          <div><Label>{l("地点", "Location")}</Label><Input value={f.location} onChange={set("location")} /></div>
          <div><Label>LinkedIn</Label><Input value={f.linkedin_url} onChange={set("linkedin_url")} /></div>
          <div className="sm:col-span-2"><Label>{l("CV 链接", "CV link")}</Label><Input value={f.cv_url} onChange={set("cv_url")} /></div>
          <div className="sm:col-span-2"><Label>{l("分类", "Category")}</Label><Input list="talent-cats" value={f.category} onChange={set("category")} placeholder={l("例如：博士候选、资深工程师", "e.g. PhD pipeline, Senior engineers")} /></div>
          <div className="sm:col-span-2"><Label>{l("标签（逗号分隔）", "Tags (comma separated)")}</Label><Input value={f.tags} onChange={set("tags")} /></div>
          <div className="sm:col-span-2"><Label>{l("备注", "Notes")}</Label><Textarea rows={3} value={f.notes} onChange={set("notes")} /></div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1"><FileUp className="h-4 w-4" />{l("上传 PDF 简历（用于 AI 分析）", "Upload PDF CV (for AI analysis)")}</Label>
            <Input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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

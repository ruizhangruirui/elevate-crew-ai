import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser, type AppUser } from "./auth.server";
import { talentSyncLookup, sanitizeMatches, clampScore, type TalentRow, type TalentRoleMatch, type TalentDirection, type TalentBreakdown } from "./talent-pool";

const POOL_ROLES = ["owner", "hr", "recruiter"] as const;
const COLS = "id,name,email,phone,location,linkedin_url,cv_url,cv_text,headline,notes,category,tags,source,teamtailor_candidate_id,teamtailor_applied_jobs,current_company,current_title,education,previous_roles,previous_companies,contracted,ai_score,ai_summary,ai_directions,ai_breakdown,ai_role_matches,ai_analyzed_at,archived,created_at";

type Db = Awaited<ReturnType<typeof admin>>;

function toRow(r: Record<string, unknown>): TalentRow {
  const { cv_text, ...rest } = r;
  return { ...(rest as unknown as TalentRow), has_cv_text: typeof cv_text === "string" && cv_text.trim().length > 0 };
}

/** Open recruiting positions the user may see (scoped HR/Recruiter only get their Labs + shared). */
async function openRoles(db: Db, user: AppUser) {
  const { data, error } = await db
    .from("roles")
    .select("id,title,job_title,description,level_min,level_max,contract_type,location,recruiting_only,recruiter_person_id,approval_status,org_node_id")
    .eq("archived", false)
    .eq("recruiting_archived", false);
  if (error) throw new Error(error.message);
  let roles = (data ?? []).filter((r) => r.approval_status !== "pending" && (r.recruiting_only || r.recruiter_person_id));
  if ((user.role === "hr" || user.role === "recruiter" || user.role === "manager") && user.scope_node_ids.length) {
    const { managerScope } = await import("./auth.server");
    const { scopedRoleIds, sharedRoleIds } = await import("./role-scope.server");
    const scope = await managerScope(user);
    const ok = new Set([...(await scopedRoleIds(db, scope.nodeIds)), ...(await sharedRoleIds(db, user))]);
    roles = roles.filter((r) => ok.has(r.id));
  }
  return roles;
}

const CATEGORY_CATALOG_KEY = "talent_categories";

function parseCatalog(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 100) : [];
  } catch { return []; }
}

export const listTalentPool = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser([...POOL_ROLES]);
  const db = await admin();
  const { data, error } = await db.from("talent_pool").select(COLS).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: catRow } = await db.from("config_items").select("name").eq("category", CATEGORY_CATALOG_KEY).limit(1);
  const roles = await openRoles(db, user);
  return {
    talents: (data ?? []).map((r) => toRow(r as Record<string, unknown>)),
    openRoles: roles.map((r) => ({ id: r.id, title: r.title })),
    canDelete: user.role === "owner" || user.role === "hr_director",
    categoryCatalog: parseCatalog((catRow?.[0] as { name?: string } | undefined)?.name),
  };
});

/** Read-only view for managers: same pool, position matches scoped to their Labs, no edit rights. */
export const listTalentPoolManager = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser(["manager"]);
  const db = await admin();
  const { data, error } = await db.from("talent_pool").select(COLS).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: catRow } = await db.from("config_items").select("name").eq("category", CATEGORY_CATALOG_KEY).limit(1);
  const roles = await openRoles(db, user);
  return {
    talents: (data ?? []).map((r) => toRow(r as Record<string, unknown>)),
    openRoles: roles.map((r) => ({ id: r.id, title: r.title })),
    canDelete: false,
    categoryCatalog: parseCatalog((catRow?.[0] as { name?: string } | undefined)?.name),
  };
});

/** Persist the category catalog (names may exist before anyone is assigned). */
export const saveTalentCategoryCatalog = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ categories: z.array(z.string().trim().min(1).max(80)).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser([...POOL_ROLES]);
    const db = await admin();
    const names = [...new Set(data.categories.map((c) => c.trim()))];
    const { data: existing } = await db.from("config_items").select("id").eq("category", CATEGORY_CATALOG_KEY).limit(1);
    const row = { category: CATEGORY_CATALOG_KEY, name: JSON.stringify(names), updated_at: new Date().toISOString() };
    const { error } = existing?.[0]
      ? await db.from("config_items").update(row as never).eq("id", (existing[0] as { id: string }).id)
      : await db.from("config_items").insert(row as never);
    if (error) throw new Error(error.message);
    await db.from("audit_log").insert({ actor: user.name, action: "talent_category_catalog", entity: "config_items", detail: names.join(", ") } as never);
    return { ok: true };
  });

const talentInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  linkedin_url: z.string().trim().max(500).nullable().optional(),
  cv_url: z.string().trim().max(1000).nullable().optional(),
  headline: z.string().trim().max(300).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  cv_text: z.string().max(40000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  archived: z.boolean().optional(),
  contracted: z.boolean().nullable().optional(),
  current_company: z.string().trim().max(200).nullable().optional(),
});

export const saveTalent = createServerFn({ method: "POST" })
  .inputValidator((d) => talentInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser([...POOL_ROLES]);
    const db = await admin();
    const { id, ...fields } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = typeof v === "string" && !v.trim() && k !== "name" ? null : v;
    if (id) {
      const { error } = await db.from("talent_pool").update(patch as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await db
      .from("talent_pool")
      .insert({ ...patch, source: "Manual", created_by: user.name } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await db.from("audit_log").insert({ actor: user.name, action: "talent_add", entity: "talent_pool", detail: data.name } as never);
    return { id: (row as { id: string }).id };
  });

/** PDF CV upload → extracted text stored for AI analysis (file itself is not kept). */
export const uploadTalentCv = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), base64: z.string().min(10).max(14_000_000) }).parse(d))
  .handler(async ({ data }) => {
    await requireUser([...POOL_ROLES]);
    const { cvToText } = await import("./pdf-text.server");
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const read = await cvToText(bin);
    if (read.text === null) throw new Error(read.reason === "unsupported_format" ? "Unsupported file: upload a PDF or Word (.docx) CV." : "No readable text in this CV (likely a scanned image). Paste the CV text instead.");
    const text = read.text;
    const db = await admin();
    const { error } = await db.from("talent_pool").update({ cv_text: text, updated_at: new Date().toISOString() } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { chars: text.length };
  });

/** Assign one category to many talents at once (empty = clear). */
export const setTalentCategory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), category: z.string().trim().max(80).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser([...POOL_ROLES]);
    const db = await admin();
    const { error } = await db.from("talent_pool").update({ category: data.category || null, updated_at: new Date().toISOString() } as never).in("id", data.ids);
    if (error) throw new Error(error.message);
    await db.from("audit_log").insert({ actor: user.name, action: "talent_category", entity: "talent_pool", detail: `${data.ids.length} → ${data.category ?? "(none)"}` } as never);
    return { ok: true };
  });

/** Rename a category for everyone in it, or clear it (to=null) to remove the category. */
export const renameTalentCategory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ from: z.string().trim().min(1).max(80), to: z.string().trim().max(80).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser([...POOL_ROLES]);
    const db = await admin();
    const { error } = await db.from("talent_pool").update({ category: data.to?.trim() || null, updated_at: new Date().toISOString() } as never).eq("category", data.from);
    if (error) throw new Error(error.message);
    await db.from("audit_log").insert({ actor: user.name, action: "talent_category_rename", entity: "talent_pool", detail: `${data.from} → ${data.to ?? "(none)"}` } as never);
    return { ok: true };
  });

export const deleteTalent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser(["owner"]);
    const db = await admin();
    const { error } = await db.from("talent_pool").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await db.from("audit_log").insert({ actor: user.name, action: "talent_delete", entity: "talent_pool", detail: data.id } as never);
    return { ok: true };
  });

/** Upsert all TeamTailor candidates by their TeamTailor ID; manual edits to notes/tags/CV text are kept. */
export const syncTalentFromTeamTailor = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser([...POOL_ROLES]);
  const apiKey = process.env["TEAMTAILOR_API_KEY"];
  if (!apiKey) throw new Error("TeamTailor API key is not configured on the server");
  const region = (process.env["TEAMTAILOR_REGION"] ?? "eu").trim().toLowerCase();
  const { fetchTeamTailorCandidates } = await import("./teamtailor.server");
  const { candidates, capped } = await fetchTeamTailorCandidates(apiKey, region);
  const db = await admin();
  const { data: existing, error } = await db.from("talent_pool").select("id,teamtailor_candidate_id,email,tags");
  if (error) throw new Error(error.message);
  const findExisting = talentSyncLookup(existing ?? []);
  let imported = 0;
  let updated = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const base = { name: c.name, email: c.email, phone: c.phone, location: c.location, linkedin_url: c.linkedin, cv_url: c.profileUrl, headline: c.pitch?.slice(0, 300) ?? null, teamtailor_applied_jobs: c.appliedJobs };
    const hit = findExisting(c.id, c.email);
    if (hit) {
      const tags = [...new Set([...(hit.tags ?? []), ...c.tags])];
      const { error: e } = await db.from("talent_pool").update({ ...base, tags, teamtailor_candidate_id: c.id, updated_at: new Date().toISOString() } as never).eq("id", hit.id);
      if (e) throw new Error(e.message);
      updated++;
    } else {
      inserts.push({ ...base, tags: c.tags, source: "TeamTailor", teamtailor_candidate_id: c.id, created_by: user.name });
    }
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error: e } = await db.from("talent_pool").insert(inserts.slice(i, i + 200) as never[]);
    if (e) throw new Error(e.message);
    imported += inserts.slice(i, i + 200).length;
  }
  await db.from("audit_log").insert({ actor: user.name, action: "talent_teamtailor_sync", entity: "talent_pool", detail: `imported ${imported}, updated ${updated}` } as never);
  return { imported, updated, total: candidates.length, capped };
});

const strArr = { type: "array", items: { type: "string" } };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "summary", "breakdown", "directions", "role_matches", "current_company", "current_title", "education", "previous_roles", "previous_companies"],
  properties: {
    current_company: { type: "string" },
    current_title: { type: "string" },
    education: strArr,
    previous_roles: strArr,
    previous_companies: strArr,
    score: { type: "integer" },
    summary: { type: "string" },
    breakdown: {
      type: "object",
      additionalProperties: false,
      required: ["education", "experience", "projects", "skills"],
      properties: { education: { type: "integer" }, experience: { type: "integer" }, projects: { type: "integer" }, skills: { type: "integer" } },
    },
    directions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["direction", "reason"], properties: { direction: { type: "string" }, reason: { type: "string" } } },
    },
    role_matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role_id", "role_title", "fit_score", "reason"],
        properties: { role_id: { type: "string" }, role_title: { type: "string" }, fit_score: { type: "integer" }, reason: { type: "string" } },
      },
    },
  },
};
void strArr;

export const analyzeTalent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), lang: z.enum(["zh", "en"]).optional(), provider: z.enum(["openai", "huawei"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser([...POOL_ROLES]);
    const db = await admin();
    const { data: t, error } = await db.from("talent_pool").select(COLS).eq("id", data.id).single();
    if (error || !t) throw new Error("Talent not found");
    const zh = data.lang === "zh";
    let cv = (t.cv_text as string | null)?.trim() || null;
    let reason: string = "no_file";
    if (!cv && t.teamtailor_candidate_id && process.env["TEAMTAILOR_API_KEY"]) {
      const { fetchTeamTailorResumeText } = await import("./teamtailor.server");
      const read = await fetchTeamTailorResumeText(process.env["TEAMTAILOR_API_KEY"], (process.env["TEAMTAILOR_REGION"] ?? "eu").trim().toLowerCase(), t.teamtailor_candidate_id as string)
        .catch(() => ({ text: null, reason: "download_failed" as const }));
      if (read.text) { cv = read.text; await db.from("talent_pool").update({ cv_text: cv } as never).eq("id", data.id); }
      else if (read.text === null) reason = read.reason;
    }
    // Never analyze without a real CV: profile-only input makes the model guess schools and employers.
    if (!cv) {
      const msg: Record<string, [string, string]> = {
        no_file: ["未找到简历：请上传 PDF / Word 简历或粘贴简历文字后再分析。", "No CV found: upload a PDF/Word CV or paste CV text first."],
        download_failed: ["TeamTailor 简历下载失败，请稍后重试或手动上传简历。", "TeamTailor CV download failed; retry later or upload the CV."],
        unsupported_format: ["简历格式无法读取（仅支持 PDF / Word .docx），请粘贴简历文字。", "Unsupported CV format (PDF/.docx only); paste the CV text."],
        no_text: ["简历是扫描件或图片，读不出文字，请粘贴简历文字。", "CV is a scanned image with no readable text; paste the CV text."],
      };
      const m = msg[reason] ?? msg["no_file"]!;
      throw new Error(zh ? m[0] : m[1]);
    }
    const profile = [t.notes, (t.tags as string[] | null)?.join(", ")].filter(Boolean).join("\n");
    const roles = await openRoles(db, user);
    const { generateStructured } = await import("./ai-gateway.server");
    const lang = data.lang === "zh" ? "使用中文输出，技术名词保留英文。" : "Write all output in concise professional English.";
    const out = await generateStructured<{ score: number; summary: string; breakdown: TalentBreakdown; directions: TalentDirection[]; role_matches: TalentRoleMatch[]; current_company?: string; current_title?: string; education?: string[]; previous_roles?: string[]; previous_companies?: string[] }>({
      provider: data.provider,
      schemaName: "talent_analysis",
      system:
        "You are a recruiting analyst for a research institute. Evaluate a candidate ONLY from the CV/profile evidence given. " +
        "Score each dimension independently 0-100 (the overall score is computed by the system as their average) (education, experience = work history, projects, skills). Missing evidence lowers confidence; never invent degrees, employers or projects. " +
        "STRICT EVIDENCE RULE: every school, degree, employer and job title you output must appear verbatim (or as an obvious translation/abbreviation) in the CV text. If you cannot point to it in the CV, leave it out (empty string or empty array). Do not infer schools from cities, or employers from skills. Profile notes are recruiter notes, not CV evidence. " +
        "Read the whole CV, including multi-column layouts where sections may be interleaved; dates near a line belong to that entry. " +
        "Extract current_company (the employer of the current/most recent ongoing role; empty string if none or unclear) and previous_companies (earlier employers, most recent first, max 6, no duplicates) strictly from the CV. Also extract current_title (job title of the current/most recent role, original language, empty if unclear) and education (each degree as \"Degree · School\", e.g. \"PhD · ETH Zurich\", highest first, max 4), and previous_roles (earlier positions as \"Job title · Company\", most recent first, max 4). " +
        "Keep everything brief: summary at most 2 short sentences (under 40 words); each direction reason and each role match reason at most 12 words. " +
        "Suggest 1-4 research/work directions the candidate fits, each with a short evidence-based reason. " +
        "For role_matches use ONLY role_id values from the provided open positions list; include at most 5 with fit_score >= 40, otherwise return an empty array. " +
        "Do not consider age, gender, nationality, religion, marital status, photos or other protected characteristics. " + lang,
      input: [
        `Candidate: ${t.name}${t.location ? ` (${t.location})` : ""}`,
        profile ? `Profile notes:\n${profile}` : "",
        `CV text (authoritative source):\n<<<CV\n${cv.slice(0, 30000)}\nCV>>>`,
        `Open positions (JSON):\n${JSON.stringify(roles.map((r) => ({ role_id: r.id, title: r.title, job_title: r.job_title, level: `${r.level_min}-${r.level_max}`, description: (r.description ?? "").slice(0, 1500) })))}`,
      ].filter(Boolean).join("\n\n"),
      schema: SCHEMA,
    });
    const { verifyNames, verifyPaired, appearsInCv } = await import("./cv-evidence");
    const curCo = out.current_company?.trim().slice(0, 200) || null;
    const result = {
      ai_score: Math.round((clampScore(out.breakdown?.education) + clampScore(out.breakdown?.experience) + clampScore(out.breakdown?.projects) + clampScore(out.breakdown?.skills)) / 4),
      ai_summary: out.summary,
      ai_breakdown: {
        education: clampScore(out.breakdown?.education),
        experience: clampScore(out.breakdown?.experience),
        projects: clampScore(out.breakdown?.projects),
        skills: clampScore(out.breakdown?.skills),
      },
      ai_directions: (out.directions ?? []).slice(0, 4),
      ai_role_matches: sanitizeMatches(out.role_matches ?? [], roles),
      ai_analyzed_at: new Date().toISOString(),
      current_company: curCo && appearsInCv(curCo, cv) ? curCo : null,
      current_title: out.current_title?.trim().slice(0, 200) || null,
      education: verifyPaired([...new Set((out.education ?? []).map((c) => c.trim().slice(0, 200)).filter(Boolean))].slice(0, 4), cv),
      previous_roles: verifyPaired([...new Set((out.previous_roles ?? []).map((c) => c.trim().slice(0, 200)).filter(Boolean))].slice(0, 4), cv),
      previous_companies: verifyNames([...new Set((out.previous_companies ?? []).map((c) => c.trim()).filter(Boolean))].slice(0, 6), cv),
    };
    const { error: e } = await db.from("talent_pool").update(result as never).eq("id", data.id);
    if (e) throw new Error(e.message);
    return { ...result, usedCv: Boolean(cv) };
  });

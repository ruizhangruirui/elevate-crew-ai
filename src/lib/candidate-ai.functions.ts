import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";
import { candidateOverall } from "./candidate-ai";

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const dim = { type: "integer" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["jd_fit", "education", "experience", "skills", "publications", "summary"],
  properties: { jd_fit: dim, education: dim, experience: dim, skills: dim, publications: dim, summary: { type: "string" } },
};

/** AI-score one Recruiting candidate against its position's JD, using only the CV they applied with. */
export const analyzeCandidate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), lang: z.enum(["zh", "en"]).optional(), provider: z.enum(["openai", "huawei"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser(["owner", "hr", "recruiter"]);
    const zh = data.lang === "zh";
    const db = await admin();
    const { data: c, error } = await db.from("candidates").select("id,name,role_id,teamtailor_application_id").eq("id", data.id).single();
    if (error || !c) throw new Error("Candidate not found");
    const { data: role } = await db.from("roles").select("id,title,job_title,description,level_min,level_max,location").eq("id", c.role_id as string).single();
    if (!role) throw new Error("Position not found");
    if ((user.role === "hr" || user.role === "recruiter") && user.scope_node_ids.length) {
      const { managerScope } = await import("./auth.server");
      const { scopedRoleIds, sharedRoleIds } = await import("./role-scope.server");
      const scope = await managerScope(user);
      const ok = new Set([...(await scopedRoleIds(db, scope.nodeIds)), ...(await sharedRoleIds(db, user))]);
      if (!ok.has(role.id)) throw new Error("Forbidden: position outside your scope");
    }
    if (!(role.description ?? "").trim()) throw new Error(zh ? "该岗位还没有 Job Description，请先在 Positions 填写。" : "This position has no Job Description yet; add it in Positions first.");
    const apiKey = process.env["TEAMTAILOR_API_KEY"];
    if (!c.teamtailor_application_id || !apiKey) throw new Error(zh ? "只能分析从 TeamTailor 同步、带简历的候选人。" : "Only candidates synced from TeamTailor with a CV can be analysed.");
    const region = (process.env["TEAMTAILOR_REGION"] ?? "eu").trim().toLowerCase();
    const tt = await import("./teamtailor.server");
    const ttId = await tt.fetchTeamTailorApplicationCandidateId(apiKey, region, c.teamtailor_application_id as string).catch(() => null);
    const read = ttId ? await tt.fetchTeamTailorResumeText(apiKey, region, ttId).catch(() => ({ text: null, reason: "download_failed" as const })) : { text: null, reason: "download_failed" as const };
    const cv = read.text?.trim();
    if (!cv) {
      const msg: Record<string, [string, string]> = {
        no_file: ["TeamTailor 上没有该候选人的简历。", "No CV attached in TeamTailor."],
        download_failed: ["TeamTailor 简历下载失败，请稍后重试。", "TeamTailor CV download failed; retry later."],
        unsupported_format: ["简历格式无法读取（仅支持 PDF / Word .docx）。", "Unsupported CV format (PDF/.docx only)."],
        no_text: ["简历是扫描件或图片，读不出文字。", "CV is a scanned image with no readable text."],
      };
      const m = msg["reason" in read ? read.reason : "no_file"] ?? msg["no_file"]!;
      throw new Error(zh ? m[0] : m[1]);
    }
    const { generateStructured } = await import("./ai-gateway.server");
    const out = await generateStructured<{ jd_fit: number; education: number; experience: number; skills: number; publications: number; summary: string }>({
      provider: data.provider,
      schemaName: "candidate_jd_fit",
      system:
        "You are a recruiting analyst for a research institute. Score one applicant ONLY from their CV text against the given job description. " +
        "Score 0-100 each: jd_fit (how well the CV matches the JD's required responsibilities, knowledge and level), education (degree level, field relevance, institution), experience (relevant work history depth), skills (JD-relevant technical skills evidenced in the CV), publications (papers, patents, open-source; 0-20 if none). " +
        "Missing evidence lowers the score; never invent facts. Summary: at most 2 short sentences (under 40 words) naming the main strength and main gap. " +
        "Do not consider age, gender, nationality, religion, marital status, photos or other protected characteristics. " +
        (zh ? "使用中文输出，技术名词保留英文。" : "Write in concise professional English."),
      input: [
        `Position: ${role.title}${role.job_title ? ` (${role.job_title})` : ""}, level ${role.level_min}-${role.level_max}${role.location ? `, ${role.location}` : ""}`,
        `Job description:\n${(role.description ?? "").slice(0, 6000)}`,
        `Applicant: ${c.name}`,
        `CV text (authoritative source):\n<<<CV\n${cv.slice(0, 30000)}\nCV>>>`,
      ].join("\n\n"),
      schema: SCHEMA,
    });
    const s = { jd_fit: clamp(out.jd_fit), education: clamp(out.education), experience: clamp(out.experience), skills: clamp(out.skills), publications: clamp(out.publications) };
    const result = {
      ai_score: candidateOverall(s),
      ai_jd_fit: s.jd_fit, ai_education: s.education, ai_experience: s.experience, ai_skills: s.skills, ai_publications: s.publications,
      ai_summary: (out.summary ?? "").slice(0, 500),
      ai_analyzed_at: new Date().toISOString(),
    };
    const { error: e } = await db.from("candidates").update(result as never).eq("id", c.id);
    if (e) throw new Error(e.message);
    return result;
  });

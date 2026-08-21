import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RoleProfileDraft = {
  domains: string[];
  knowledge: string[];
  leadership: string[];
  experience: string[];
  skills: { skill: string; level: string }[];
  kpa: string;
  recommended_action: string[];
};

export type FitResult = {
  person_id: string;
  person_name: string;
  fit_score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendation: string;
};

const strArray = { type: "array", items: { type: "string" } };

export type AiLang = "zh" | "en";

/** Default output language is English; pass lang: "zh" to get Chinese. */
function langRule(lang: AiLang = "en") {
  return lang === "zh"
    ? "使用中文输出，专有技术名词保留英文。"
    : "Write ALL output in English (professional, concise business English), even when the source data is in Chinese. Keep proper nouns (people names, team names) as-is.";
}

export const generateRoleProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { roleId: string; lang?: AiLang }) => {
    if (!input?.roleId) throw new Error("缺少岗位");
    return input;
  })
  .handler(async ({ data, context }): Promise<RoleProfileDraft> => {
    const lang: AiLang = data.lang ?? "en";
    const { generateStructured } = await import("./ai-gateway.server");

    const { data: role, error } = await context.supabase
      .from("roles")
      .select("title, description, level_min, level_max, criticality, direction_id")
      .eq("id", data.roleId)
      .single();
    if (error || !role) throw new Error("岗位不存在");

    const { data: direction } = await context.supabase
      .from("directions")
      .select("title, description")
      .eq("id", role.direction_id)
      .single();

    return generateStructured<RoleProfileDraft>({
      schemaName: "role_profile",
      system:
        "你是资深的技术组织人才架构顾问，服务于一个前沿网络/芯片研究实验室。基于研究方向与岗位信息，输出严谨、具体、可落地的岗位画像。每个数组 3-6 项，用短语，不要整句。" +
        langRule(lang),
      input: [
        `研究方向：${direction?.title ?? "未知"}`,
        `方向描述：${direction?.description ?? "无"}`,
        `岗位名称：${role.title}`,
        `岗位描述：${role.description ?? "无"}`,
        `目标级别：${role.level_min}-${role.level_max}`,
        `关键度：${role.criticality}`,
        "请生成：专业领域(domains)、关键知识(knowledge)、领导力要求(leadership)、经验要求(experience)、技能要求(skills，level 取 Expert/Advanced/Proficient 之一)、关键绩效领域(kpa，一句话)、建议行动(recommended_action)。",
      ].join("\n"),
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "domains",
          "knowledge",
          "leadership",
          "experience",
          "skills",
          "kpa",
          "recommended_action",
        ],
        properties: {
          domains: strArray,
          knowledge: strArray,
          leadership: strArray,
          experience: strArray,
          skills: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["skill", "level"],
              properties: {
                skill: { type: "string" },
                level: { type: "string", enum: ["Expert", "Advanced", "Proficient"] },
              },
            },
          },
          kpa: { type: "string" },
          recommended_action: strArray,
        },
      },
    });
  });

export const analyzeRoleFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { roleId: string; lang?: AiLang }) => {
    if (!input?.roleId) throw new Error("缺少岗位");
    return input;
  })
  .handler(async ({ data, context }): Promise<FitResult[]> => {
    const lang: AiLang = data.lang ?? "en";
    const { generateStructured } = await import("./ai-gateway.server");

    const { data: role, error } = await context.supabase
      .from("roles")
      .select(
        "id, title, description, level_min, level_max, criticality, domains, knowledge, leadership, experience, skills",
      )
      .eq("id", data.roleId)
      .single();
    if (error || !role) throw new Error("岗位不存在");

    const { data: people } = await context.supabase
      .from("people")
      .select(
        "id, name, level, status, note, assessed_skills, performance, tenure_months, prior_experience, readiness, attrition_risk",
      )
      .order("created_at");

    const candidates = (people ?? []).filter((p) => p.status !== "left");
    if (!candidates.length) throw new Error("暂无可分析的人员数据");

    const result = await generateStructured<{ results: FitResult[] }>({
      schemaName: "role_fit",
      system:
        "你是资深人才盘点顾问。所有人员数据均由 HR / 主管评估录入，没有员工自评，请据此判断可信度。为每位候选人给出对目标岗位的匹配度评分（0-100）、优势、缺口与培养建议。简洁具体，不要空话。person_id 与 person_name 必须原样返回。" +
        langRule(lang),
      input: JSON.stringify({ role, candidates }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["results"],
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "person_id",
                "person_name",
                "fit_score",
                "summary",
                "strengths",
                "gaps",
                "recommendation",
              ],
              properties: {
                person_id: { type: "string" },
                person_name: { type: "string" },
                fit_score: { type: "integer" },
                summary: { type: "string" },
                strengths: strArray,
                gaps: strArray,
                recommendation: { type: "string" },
              },
            },
          },
        },
      },
    });

    const valid = result.results.filter((r) => candidates.some((c) => c.id === r.person_id));

    if (valid.length) {
      const { error: upsertError } = await context.supabase.from("person_role_fit").upsert(
        valid.map((r) => ({
          person_id: r.person_id,
          role_id: role.id,
          fit_score: Math.max(0, Math.min(100, Math.round(r.fit_score))),
          summary: r.summary,
          strengths: r.strengths,
          gaps: r.gaps,
          recommendation: r.recommendation,
          source: "ai",
          model: "openai/gpt-5.6-sol",
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "person_id,role_id" },
      );
      if (upsertError) throw upsertError;
    }

    return valid.sort((a, b) => b.fit_score - a.fit_score);
  });

export type TeamDiagnosis = {
  headline: string;
  strengths: string[];
  missing_roles: { title: string; why: string; urgency: string }[];
  missing_capabilities: { capability: string; action: string }[];
  hire_vs_grow: string;
  next_90_days: string[];
};

export const diagnoseTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nodeId: string; lang?: AiLang }) => {
    if (!input?.nodeId) throw new Error("缺少组织节点");
    return input;
  })
  .handler(async ({ data, context }): Promise<TeamDiagnosis> => {
    const lang: AiLang = data.lang ?? "en";
    const { generateStructured } = await import("./ai-gateway.server");

    const { data: node, error } = await context.supabase
      .from("org_nodes")
      .select("id, name, type, mission")
      .eq("id", data.nodeId)
      .single();
    if (error || !node) throw new Error("组织节点不存在");

    const { data: allNodes } = await context.supabase.from("org_nodes").select("id, parent_id");
    const ids = new Set<string>([node.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of allNodes ?? []) {
        if (n.parent_id && ids.has(n.parent_id) && !ids.has(n.id)) {
          ids.add(n.id);
          grew = true;
        }
      }
    }

    const { data: people } = await context.supabase
      .from("people")
      .select(
        "id, name, level, status, role_id, org_node_id, assessed_skills, performance, readiness, attrition_risk, tenure_months",
      );
    const members = (people ?? []).filter((p) => p.org_node_id && ids.has(p.org_node_id));

    const { data: roles } = await context.supabase
      .from("roles")
      .select("id, title, direction_id, target_count, criticality, domains, knowledge, skills, kpa")
      .eq("archived", false);
    const { data: directions } = await context.supabase
      .from("directions")
      .select("id, title, description")
      .eq("archived", false);

    const roleIds = new Set(members.map((m) => m.role_id).filter(Boolean));
    const teamRoles = (roles ?? []).filter((r) => roleIds.has(r.id));

    const { data: activities } = await context.supabase
      .from("org_activities")
      .select("kind, title, happened_on, capability_tags")
      .order("happened_on", { ascending: false })
      .limit(20);

    return generateStructured<TeamDiagnosis>({
      schemaName: "team_diagnosis",
      system:
        "你是技术研究组织的组织能力顾问。关注点不是个人绩效，而是「为达成战略方向，这个团队还缺什么岗位、什么能力，应该先招人还是先培养」。所有人员数据由 HR / 主管录入。具体、可执行，不要空话套话。" +
        langRule(lang),
      input: JSON.stringify({
        node,
        strategy_directions: directions ?? [],
        team_roles: teamRoles,
        members,
        recent_activities: activities ?? [],
      }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "headline",
          "strengths",
          "missing_roles",
          "missing_capabilities",
          "hire_vs_grow",
          "next_90_days",
        ],
        properties: {
          headline: { type: "string" },
          strengths: strArray,
          missing_roles: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "why", "urgency"],
              properties: {
                title: { type: "string" },
                why: { type: "string" },
                urgency: {
                  type: "string",
                  enum: lang === "zh" ? ["高", "中", "低"] : ["High", "Medium", "Low"],
                },
              },
            },
          },
          missing_capabilities: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["capability", "action"],
              properties: {
                capability: { type: "string" },
                action: { type: "string" },
              },
            },
          },
          hire_vs_grow: { type: "string" },
          next_90_days: strArray,
        },
      },
    });
  });

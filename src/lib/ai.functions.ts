import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth-middleware";
import { roleAiInput, roleProfileSystem, roleFitSystem, fitCandidates } from "./role-ai";

export type AiProvider = "openai" | "huawei";

/** Which AI providers are configured on the server (drives the "Run with …" picker). */
export const listAiProviders = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<AiProvider[]> => {
    const { configuredAiProviders } = await import("./ai-gateway.server");
    return configuredAiProviders();
  });

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
  .middleware([requireAppAuth])
  .inputValidator((input) => roleAiInput.parse(input))
  .handler(async ({ data, context }): Promise<RoleProfileDraft> => {
    const lang: AiLang = data.lang ?? "en";
    const { generateStructured } = await import("./ai-gateway.server");
    const { roleAnalysisScope } = await import("./role-scope.server");
    await roleAnalysisScope(context.supabase, context.user, data.roleId);

    const { data: role, error } = await context.supabase
      .from("roles")
      .select("title, description, level_min, level_max, criticality, direction_id")
      .eq("id", data.roleId)
      .single();
    if (error || !role) throw new Error("岗位不存在");
    const sourceRole = { ...role, ...data.draft };
    if (!sourceRole.description?.trim()) throw new Error("请先填写 Job Description");

    const { data: direction } = await context.supabase
      .from("directions")
      .select("title, description")
      .eq("id", role.direction_id)
      .single();

    return generateStructured<RoleProfileDraft>({
      provider: data.provider,
      schemaName: "role_profile",
      system:
        roleProfileSystem +
        langRule(lang),
      input: [
        `研究方向：${direction?.title ?? "未知"}`,
        `方向描述：${direction?.description ?? "无"}`,
        `岗位名称：${sourceRole.title}`,
        `岗位描述：${sourceRole.description}`,
        `目标级别：${sourceRole.level_min}-${sourceRole.level_max}`,
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
  .middleware([requireAppAuth])
  .inputValidator((input: { roleId: string; lang?: AiLang; provider?: AiProvider | undefined }) => {
    if (!input?.roleId) throw new Error("缺少岗位");
    return input;
  })
  .handler(async ({ data, context }): Promise<FitResult[]> => {
    const lang: AiLang = data.lang ?? "en";
    const { generateStructured } = await import("./ai-gateway.server");
    // Recruiter people reads exist for pickers, not for confidential talent assessments.
    if (context.user.role === "recruiter") throw new Error("人岗匹配分析仅对 HR 和主管开放");
    const { roleAnalysisScope } = await import("./role-scope.server");
    const scope = await roleAnalysisScope(context.supabase, context.user, data.roleId);

    const { data: role, error } = await context.supabase
      .from("roles")
      .select(
        "id, title, description, level_min, level_max, criticality, domains, knowledge, leadership, experience, skills",
      )
      .eq("id", data.roleId)
      .single();
    if (error || !role) throw new Error("岗位不存在");

    let peopleQuery = context.supabase
      .from("people")
      .select(
        "id, name, level, status, archived, role_id, assessed_skills, performance, prior_experience",
      )
      .order("created_at");
    if (scope) peopleQuery = peopleQuery.in("id", [...scope.personIds]);
    const { data: people, error: peopleError } = await peopleQuery;
    if (peopleError) throw new Error("无法读取人员评估资料");

    const candidates = fitCandidates(people ?? []);
    if (!candidates.length) throw new Error("暂无可分析的人员数据");

    const result = await generateStructured<{ results: FitResult[] }>({
      provider: data.provider,
      schemaName: "role_fit",
      system:
        roleFitSystem +
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

    const seen = new Set<string>();
    const valid = result.results.flatMap((r) => {
      const person = candidates.find((candidate) => candidate.id === r.person_id);
      if (!person || seen.has(person.id) || !Number.isFinite(r.fit_score)) return [];
      seen.add(person.id);
      return [{ ...r, person_name: person.name, fit_score: Math.max(0, Math.min(100, Math.round(r.fit_score))) }];
    });

    if (valid.length) {
      const usedModel = (await import("./ai-gateway.server")).aiConfig(data.provider).model;
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
          model: usedModel,
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
  .middleware([requireAppAuth])
  .inputValidator((input: { nodeId: string; lang?: AiLang; provider?: AiProvider | undefined }) => {
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
      provider: data.provider,
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

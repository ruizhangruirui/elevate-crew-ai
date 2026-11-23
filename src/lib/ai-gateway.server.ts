type JsonSchema = Record<string, unknown>;

/**
 * AI 调用配置（全部可在服务器环境变量中覆盖，方便内网部署切换到公司模型）：
 * - AI_BASE_URL：OpenAI 兼容接口地址；设置 AI_API_KEY/OPENAI_API_KEY 时默认 OpenAI 官方接口，否则默认 Lovable AI 网关
 * - AI_API_KEY / OPENAI_API_KEY：接口密钥，默认 LOVABLE_API_KEY
 * - AI_MODEL：模型 ID；OpenAI 直连默认 gpt-5，Lovable 网关默认 openai/gpt-6-astra
 */
const LOVABLE_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const LOVABLE_DEFAULT_MODEL = "openai/gpt-6-astra";
const OPENAI_DEFAULT_MODEL = "gpt-5";

export type AiProvider = "openai" | "huawei";

/**
 * provider 省略时自动选择：自有 key（AI_API_KEY/OPENAI_API_KEY）→ OpenAI 直连，否则 Lovable 网关。
 * provider = "openai"：强制使用自有 OpenAI key（AI_API_KEY/OPENAI_API_KEY，可选 AI_BASE_URL/AI_MODEL）。
 * provider = "huawei"：华为内部 AI 网关，需 HUAWEI_AI_BASE_URL / HUAWEI_AI_API_KEY / HUAWEI_AI_MODEL。
 */
export function aiConfig(provider?: AiProvider) {
  if (provider === "huawei") {
    const apiKey = process.env["HUAWEI_AI_API_KEY"];
    const baseURL = (process.env["HUAWEI_AI_BASE_URL"] || "").replace(/\/+$/, "");
    const model = process.env["HUAWEI_AI_MODEL"];
    if (!apiKey || !baseURL) throw new Error("华为内部 AI 未配置：请在服务器环境变量中设置 HUAWEI_AI_BASE_URL 和 HUAWEI_AI_API_KEY");
    if (!model) throw new Error("华为内部 AI 未配置：请在服务器环境变量中设置 HUAWEI_AI_MODEL（模型 ID）");
    return { baseURL, apiKey, model, isLovableGateway: false };
  }
  const ownKey = process.env["AI_API_KEY"] || process.env["OPENAI_API_KEY"];
  if (provider === "openai" && !ownKey) throw new Error("OpenAI 未配置：请在服务器环境变量中设置 OPENAI_API_KEY");
  const apiKey = ownKey || process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI 服务未配置：请在服务器环境变量中设置 AI_API_KEY");
  const defaultBase = ownKey ? OPENAI_BASE_URL : LOVABLE_BASE_URL;
  const baseURL = (process.env["AI_BASE_URL"] || defaultBase).replace(/\/+$/, "");
  const isLovableGateway = baseURL.startsWith(LOVABLE_BASE_URL);
  const defaultModel = isLovableGateway ? LOVABLE_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL;
  return { baseURL, apiKey, model: process.env["AI_MODEL"] || defaultModel, isLovableGateway };
}

/** Providers with enough server config to be offered in the UI. */
export function configuredAiProviders(): AiProvider[] {
  const out: AiProvider[] = [];
  if (process.env["AI_API_KEY"] || process.env["OPENAI_API_KEY"]) out.push("openai");
  if (process.env["HUAWEI_AI_API_KEY"] && process.env["HUAWEI_AI_BASE_URL"] && process.env["HUAWEI_AI_MODEL"]) out.push("huawei");
  return out;
}

/**
 * Calls an OpenAI-compatible Responses API and returns strict JSON output.
 * Always streams (reasoning models can run for minutes) and accumulates the deltas.
 */
export async function generateStructured<T>({
  system,
  input,
  schemaName,
  schema,
  model,
  provider,
}: {
  system: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
  model?: string;
  provider?: AiProvider | undefined;
}): Promise<T> {
  const config = aiConfig(provider);
  const usedModel = model || config.model;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.isLovableGateway) {
    headers["Lovable-API-Key"] = config.apiKey;
    headers["X-Lovable-AIG-SDK"] = "fetch";
  }

  const res = await fetch(`${config.baseURL}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: usedModel,
      instructions: system,
      input,
      stream: true,
      store: false,
      reasoning: { effort: "medium", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI 调用频率过高，请稍后再试。");
    if (res.status === 402) throw new Error("AI 额度不足，请在工作区补充额度后再试。");
    throw new Error(`AI 调用失败 (${res.status}) ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        } else if (evt.type === "response.completed" && evt.response?.output_text) {
          if (!text) text = evt.response.output_text;
        }
      } catch {
        // ignore keepalive / partial frames
      }
    }
  }

  if (!text.trim()) throw new Error("AI 未返回结果，请重试。");
  return JSON.parse(text) as T;
}

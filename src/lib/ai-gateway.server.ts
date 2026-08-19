type JsonSchema = Record<string, unknown>;

/**
 * Calls the Lovable AI Gateway Responses API and returns strict JSON output.
 * Always streams (reasoning models can run for minutes) and accumulates the deltas.
 */
export async function generateStructured<T>({
  system,
  input,
  schemaName,
  schema,
  model = "openai/gpt-5.6-sol",
}: {
  system: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
  model?: string;
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI 服务未配置");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model,
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

// ---------------------------------------------------------------------------
// LLM provider abstraction. The agent only talks to `LLMProvider`; the gateway
// implementation (platform AI integration) lives here and can be swapped.
// ---------------------------------------------------------------------------

import { vly } from "../../lib/vly-integrations";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmJsonResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface LLMProvider {
  readonly name: string;
  completeJson<T>(
    messages: LlmMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<LlmJsonResult<T>>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

const MODEL = "gpt-4o-mini";

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : trimmed;
}

class GatewayLlm implements LLMProvider {
  readonly name = "platform-gateway";

  async completeJson<T>(
    messages: LlmMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<LlmJsonResult<T>> {
    try {
      const res = await vly.ai.completion({
        model: MODEL,
        messages: messages as { role: "system" | "user" | "assistant"; content: string }[],
        temperature: options?.temperature ?? 0.2,
        maxTokens: options?.maxTokens ?? 500,
      });
      if (!res.success || !res.data) {
        return { ok: false, error: res.error ?? "LLM gateway error" };
      }
      const content = res.data.choices?.[0]?.message?.content ?? "";
      const text = extractJsonText(content);
      try {
        return { ok: true, data: JSON.parse(text) as T };
      } catch {
        // Last-chance salvage: first {...} block.
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end > start) {
          try {
            return { ok: true, data: JSON.parse(text.slice(start, end + 1)) as T };
            } catch {
            return { ok: false, error: "LLM returned non-JSON content" };
          }
        }
        return { ok: false, error: "LLM returned non-JSON content" };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown LLM error",
      };
    }
  }

  async healthCheck() {
    try {
      const res = await vly.ai.completion({
        model: MODEL,
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 4,
      });
      return {
        ok: res.success,
        detail: res.success ? "AI gateway reachable" : res.error ?? "unavailable",
      };
      } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "unavailable",
      };
    }
  }
}

export const llm: LLMProvider = new GatewayLlm();
export const LLM_MODEL = MODEL;

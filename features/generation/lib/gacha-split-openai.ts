import {
  GACHA_SPLIT_INSTRUCTIONS,
  GACHA_SPLIT_JSON_SCHEMA,
  extractResponsesOutputText,
  numberPromptLines,
  type GachaSplitModelOutput,
} from "@/shared/generation/gacha-split";

/**
 * 「ガチャに分ける」で使う文章の AI（OpenAI Responses API）。
 *
 * モデルは Creator Looks のプロンプト抽出（extract-creator-looks-prompt）と同じものにそろえる。
 * 返させるのは「消す行の番号」と「候補」の JSON だけ（shared/generation/gacha-split.ts）。
 *
 * ⚠️ 本文（利用者のプロンプト）はログに出さない。失敗の記録は状態コードとトークン数だけ。
 */
export const GACHA_SPLIT_MODEL = "gpt-5.5";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 60_000;

export class GachaSplitModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GachaSplitModelError";
  }
}

export async function callGachaSplitModel(
  prompt: string,
  options: { apiKey?: string; fetchFn?: typeof fetch } = {},
): Promise<GachaSplitModelOutput> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new GachaSplitModelError("OPENAI_API_KEY is not set");
  const fetchFn = options.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GACHA_SPLIT_MODEL,
        instructions: GACHA_SPLIT_INSTRUCTIONS,
        input: numberPromptLines(prompt),
        // 分けるだけなので深く考えさせない（待ち時間と原価を抑える）
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "gacha_split",
            schema: GACHA_SPLIT_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new GachaSplitModelError(`OpenAI ${response.status}`);
    }

    const payload: unknown = await response.json();
    const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage;
    // 原価の見積もり用。本文は出さない
    console.info("[gacha-split] usage", {
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    });

    const text = extractResponsesOutputText(payload);
    if (!text) throw new GachaSplitModelError("empty output");
    try {
      return JSON.parse(text) as GachaSplitModelOutput;
    } catch {
      throw new GachaSplitModelError("output is not JSON");
    }
  } catch (error) {
    if (error instanceof GachaSplitModelError) throw error;
    throw new GachaSplitModelError(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "request failed",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 文字入力の欄に入れた文字を、生成の前に OpenAI Moderation API で確かめる(2026-10-11 ユーザー決定)。
 *
 * 入れた文字はそのまま画像に描かれ、投稿で公開される。画像の AI の安全チェックは軽めの言葉を通すため、
 * 生成の前にこちらでも確かめる。言葉の一覧(部分一致)は「ウルトラマンコスモス」のような
 * 問題ない言葉まで止めてしまうので使わず、文脈で判定する Moderation API に任せる。
 *
 * 方針は「止めすぎない」: 止めるのは API が flagged と判定したものだけ。
 * API が使えない・遅い・おかしな答えのときは止めない(生成を続ける)。すり抜けたものは通報と投稿の審査で対応する。
 *
 * Moderation API は無料。⚠️ 入れた文字はログに出さない(判定の結果とカテゴリ名だけ)。
 */
export const TEXT_INPUT_MODERATION_MODEL = "omni-moderation-latest";
const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";
// 生成の前に待たせるので短く。間に合わなければ止めずに進める
const REQUEST_TIMEOUT_MS = 5_000;

export type TextInputModerationResult = "flagged" | "ok" | "unavailable";

export async function moderateTextInput(
  texts: readonly string[],
  options: { apiKey?: string; fetchFn?: typeof fetch } = {},
): Promise<TextInputModerationResult> {
  const inputs = [...new Set(texts.map((text) => text.trim()).filter(Boolean))];
  if (inputs.length === 0) return "ok";

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[text-input-moderation] OPENAI_API_KEY is not set");
    return "unavailable";
  }
  const fetchFn = options.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(OPENAI_MODERATIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: TEXT_INPUT_MODERATION_MODEL, input: inputs }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      console.warn("[text-input-moderation] request failed", { status: response.status });
      return "unavailable";
    }
    const payload = (await response.json()) as {
      results?: Array<{ flagged?: unknown; categories?: Record<string, unknown> }>;
    } | null;
    const results = payload?.results;
    if (!Array.isArray(results) || results.length === 0) {
      console.warn("[text-input-moderation] unexpected response");
      return "unavailable";
    }
    const flagged = results.filter((result) => result?.flagged === true);
    if (flagged.length === 0) return "ok";
    // どの種類で止めたかだけ残す(入れた文字は出さない)
    console.info("[text-input-moderation] flagged", {
      categories: [
        ...new Set(
          flagged.flatMap((result) =>
            Object.entries(result.categories ?? {})
              .filter(([, value]) => value === true)
              .map(([name]) => name),
          ),
        ),
      ],
    });
    return "flagged";
  } catch (error) {
    console.warn("[text-input-moderation] request failed", {
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "error",
    });
    return "unavailable";
  } finally {
    clearTimeout(timeoutId);
  }
}

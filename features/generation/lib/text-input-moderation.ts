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

/**
 * API の flagged に加えて、種類ごとのスコアがこの線以上なら止める。
 * flagged は「有害な内容の文章」向けで、単語だけ(えっち・おっぱい 等)では立たなかった(2026-10-11 本番で確認)。
 * 線は本番のスコアの記録(下の scores ログ)を見て決める。空のあいだは flagged だけで止める。
 */
export const TEXT_INPUT_SCORE_THRESHOLDS: Readonly<Partial<Record<string, number>>> = {};

type ModerationResult = {
  flagged?: unknown;
  categories?: Record<string, unknown>;
  category_scores?: Record<string, unknown>;
};

/** スコアの高い順に上から3つ(線を決めるための記録用。入れた文字は含めない)。 */
function topScores(result: ModerationResult): Array<[string, number]> {
  return Object.entries(result.category_scores ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, score]) => [name, Math.round(score * 1000) / 1000]);
}

function isOverThreshold(result: ModerationResult, thresholds: Readonly<Partial<Record<string, number>>>): boolean {
  return Object.entries(result.category_scores ?? {}).some(([name, score]) => {
    const threshold = thresholds[name];
    return typeof threshold === "number" && typeof score === "number" && score >= threshold;
  });
}

export async function moderateTextInput(
  texts: readonly string[],
  options: {
    apiKey?: string;
    fetchFn?: typeof fetch;
    thresholds?: Readonly<Partial<Record<string, number>>>;
  } = {},
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
    const payload = (await response.json()) as { results?: ModerationResult[] } | null;
    const results = payload?.results;
    if (!Array.isArray(results) || results.length === 0) {
      console.warn("[text-input-moderation] unexpected response");
      return "unavailable";
    }
    // 止める線を決めるため、毎回スコアを残す(送った順=入れた文字・ラベル・入力のヒント。文字そのものは出さない)
    console.info("[text-input-moderation] scores", {
      results: results.map((result) => ({ flagged: result?.flagged === true, top: topScores(result ?? {}) })),
    });
    const thresholds = options.thresholds ?? TEXT_INPUT_SCORE_THRESHOLDS;
    const flagged = results.filter(
      (result) => result?.flagged === true || isOverThreshold(result ?? {}, thresholds),
    );
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

/**
 * 公開プロンプトの本文を取りに行くクライアント。
 *
 * 本文を props へ載せず、必要になったときだけ取りに行く。公開プロンプトは
 * フォロワーにだけ開示する値なので、payload に載せると未フォロワーのブラウザへ
 * も届いてしまう（従来はそれを表示だけ伏字にしていた）。
 *
 * 認可はサーバー側の `/api/posts/[id]/prompt-text` が行う。フォロー・ブロック・
 * 公開設定・原作の状態をすべて検証し、非公開の本文は絶対に返さない。
 * 落ちた理由は区別されないため、呼び出し側も理由で分岐しない。
 */

export async function fetchSourcePromptText(
  originPostId: string
): Promise<string> {
  const response = await fetch(
    `/api/posts/${encodeURIComponent(originPostId)}/prompt-text`
  );

  if (!response.ok) {
    // 理由は返ってこない。呼び出し側は「取れなかった」とだけ扱う（ADR-005）。
    throw new Error("SOURCE_PROMPT_TEXT_UNAVAILABLE");
  }

  const data = (await response.json()) as { prompt?: unknown };
  const prompt = typeof data.prompt === "string" ? data.prompt : "";

  if (!prompt) {
    throw new Error("SOURCE_PROMPT_TEXT_UNAVAILABLE");
  }

  return prompt;
}

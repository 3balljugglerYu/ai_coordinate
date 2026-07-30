/**
 * プロンプト施錠（非公開プロンプトの派生生成）の送信判定。
 *
 * `GenerationForm` は画像ピッカー・モデル選択・localStorage・AuthModal を
 * 抱えており、DOM テストで判定式まで押さえるのは高くつく。判定だけをここへ
 * 切り出して、実際に使われている関数をテストできるようにする。
 *
 * 計画書 ADR-006 / REQ-005。
 */

export interface GenerationSubmitGateParams {
  /** プロンプトを閲覧者に入力させないモードか。 */
  promptLocked: boolean;
  prompt: string;
  isPromptTooLong: boolean;
  hasSourceImage: boolean;
  isGenerating: boolean;
  guestGenerationLocked: boolean;
}

/**
 * 生成ボタンを押せないか。
 *
 * 施錠時は本文の有無・長さを条件にしない。ここを共通にしたままだと、
 * 入力させない欄が空であることを理由に生成ボタンが永久に押せなくなる。
 * 元画像は施錠時でも必須である（じゆうモードの生成には必ず生成元がある）。
 */
export function isGenerationSubmitDisabled(
  params: GenerationSubmitGateParams
): boolean {
  const {
    promptLocked,
    prompt,
    isPromptTooLong,
    hasSourceImage,
    isGenerating,
    guestGenerationLocked,
  } = params;

  return (
    (!promptLocked && (!prompt.trim() || isPromptTooLong)) ||
    !hasSourceImage ||
    isGenerating ||
    guestGenerationLocked
  );
}

/**
 * 送信する本文を決める。
 *
 * 施錠時は state の値を経由させず常に空にする。原作の本文はクライアントへ
 * 渡らない設計だが、ここで空へ固定しておけば「別の経路で入った値をそのまま
 * 送ってしまう」将来の取り違えも防げる。
 */
export function resolveSubmittedPrompt(
  promptLocked: boolean,
  prompt: string
): string {
  return promptLocked ? "" : prompt.trim();
}

/**
 * リクエスト body の本文 / 原作 ID を排他で組み立てる。
 *
 * サーバー側 schema は同時指定を 400 にする。クライアントでも排他にして、
 * 「原作の認可だけ借りて本文を差し替える」形のリクエストを作れないようにする。
 */
export function buildPromptRequestFields(request: {
  prompt: string;
  sourcePostId?: string;
}): { prompt: string } | { sourcePostId: string } {
  return request.sourcePostId
    ? { sourcePostId: request.sourcePostId }
    : { prompt: request.prompt };
}

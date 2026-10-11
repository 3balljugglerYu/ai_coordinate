/**
 * 生成の受付(/api/generate-async)が断ったときのエラー。画面で理由ごとに出し方を変えられるよう、
 * サーバーの errorCode を持たせる(メッセージはサーバーの文言のまま)。
 */
export class GenerationSubmitError extends Error {
  readonly errorCode: string | undefined;

  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = "GenerationSubmitError";
    this.errorCode = errorCode;
  }
}

/** 文字入力の文字が不適切と判定されて断られたか(#718)。 */
export function isTextInputFlaggedError(error: unknown): boolean {
  return error instanceof GenerationSubmitError && error.errorCode === "GENERATION_TEXT_INPUT_FLAGGED";
}

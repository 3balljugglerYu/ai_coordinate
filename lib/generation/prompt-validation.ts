export const GENERATION_PROMPT_MAX_LENGTH = 1500;

/**
 * じゆうモード(generationType="free")のプロンプト上限。
 *
 * 既定モデル OpenAI gpt-image-2 のプロンプト上限は 32,000 文字
 * (https://developers.openai.com/api/reference)。最終プロンプトは
 * 錨(free.base_prefix, 1,800字未満に維持) + delimiter + ユーザー入力 なので、
 * ユーザー入力を 30,000 字に制限すれば錨込みでも 32,000 字以内に必ず収まり、
 * プロバイダ側で長さ超過エラーが起きない。
 */
export const FREE_GENERATION_PROMPT_MAX_LENGTH = 30000;

export function isGenerationPromptTooLong(prompt: string): boolean {
  return prompt.length > GENERATION_PROMPT_MAX_LENGTH;
}

/**
 * generationType 別のプロンプト上限を返す。
 * free のみ FREE_GENERATION_PROMPT_MAX_LENGTH、それ以外は GENERATION_PROMPT_MAX_LENGTH。
 */
export function getPromptMaxLength(generationType?: string): number {
  return generationType === "free"
    ? FREE_GENERATION_PROMPT_MAX_LENGTH
    : GENERATION_PROMPT_MAX_LENGTH;
}

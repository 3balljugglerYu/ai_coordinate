export const GENERATION_PROMPT_MAX_LENGTH = 1500;

export function isGenerationPromptTooLong(prompt: string): boolean {
  return prompt.length > GENERATION_PROMPT_MAX_LENGTH;
}

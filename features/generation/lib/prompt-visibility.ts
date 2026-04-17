import type { GeneratedImageRecord } from "./database";

type PromptProtectedRecord = Pick<GeneratedImageRecord, "prompt" | "generation_type"> & {
  caption?: string | null;
};

export function shouldHidePromptForGenerationType(
  generationType?: GeneratedImageRecord["generation_type"]
): boolean {
  return generationType === "one_tap_style";
}

export function getVisiblePrompt<T extends PromptProtectedRecord>(record: T): string {
  return shouldHidePromptForGenerationType(record.generation_type)
    ? ""
    : record.prompt;
}

export function redactSensitivePrompt<T extends PromptProtectedRecord>(record: T): T {
  const visiblePrompt = getVisiblePrompt(record);
  return visiblePrompt === record.prompt
    ? record
    : {
        ...record,
        prompt: visiblePrompt,
      };
}

export function redactSensitivePrompts<T extends PromptProtectedRecord>(
  records: T[]
): T[] {
  return records.map(redactSensitivePrompt);
}

export function getPromptSafeAltText<T extends PromptProtectedRecord>(
  record: T,
  fallback: string
): string {
  const caption = record.caption?.trim();
  if (caption) {
    return caption;
  }

  const visiblePrompt = getVisiblePrompt(record).trim();
  return visiblePrompt || fallback;
}

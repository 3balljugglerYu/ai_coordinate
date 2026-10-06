import type { NameInputForUsers } from "@/shared/generation/name-input";

/**
 * カタログから使う人の生成シートに出す「名前の欄」を取りに行く(本文は返ってこない)。
 * 取れなかったときは null(名前の欄を出さないだけで、生成はできる)。
 */
export async function fetchSourceNameInput(
  originPostId: string
): Promise<NameInputForUsers | null> {
  const response = await fetch(`/api/posts/${encodeURIComponent(originPostId)}/prompt-slots`);
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { nameInput?: unknown } | null;
  const value = data?.nameInput as Partial<NameInputForUsers> | null | undefined;
  if (!value || typeof value.label !== "string") return null;
  return {
    label: value.label,
    ...(typeof value.placeholder === "string" ? { placeholder: value.placeholder } : {}),
    required: value.required === true,
  };
}

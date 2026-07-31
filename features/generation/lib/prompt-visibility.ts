import type { GeneratedImageRecord } from "./database";

type PromptProtectedRecord = Pick<GeneratedImageRecord, "prompt" | "generation_type"> & {
  caption?: string | null;
};

/**
 * プロンプト欄に何を描画するか。
 *
 * - `one_tap_style`: 運営プリセットのカード（本文は誰にも見せない）
 * - `source_reference`: 原作の参照カード（本文は見せず、派生生成だけ許す）
 * - `prompt`: 本文を表示（既存のフォローゲートは呼び出し側が適用する）
 * - `none`: 表示するものが無い
 */
export type PostPromptDisplayMode =
  | "one_tap_style"
  | "source_reference"
  | "prompt"
  | "none";

type PromptDisplayRecord = PromptProtectedRecord &
  Pick<GeneratedImageRecord, "prompt_visibility" | "source_post_id">;

export function shouldHidePromptForGenerationType(
  generationType?: GeneratedImageRecord["generation_type"]
): boolean {
  return generationType === "one_tap_style";
}

/**
 * プロンプト欄の表示モードを決める（計画書 REQ-013 / ADR-004）。
 *
 * 分岐の順序に意味がある。
 *
 * 1. 派生投稿 (`source_post_id != null`) は最優先で参照カード。
 *    派生者は原作者のプロンプトを所有していないため、`isOwner` でも本文は出さない。
 * 2. `one_tap_style` は運営資産なので生成した本人にも出さない（既存挙動）。
 * 3. `/free` の root 投稿は**公開・非公開を問わず**参照カード。
 *    公開なら「このプロンプトで作る」に加えてコピーもでき、非公開なら生成だけ。
 *    入口が公開設定で変わると分かりにくいため、UI を1つに寄せている。
 *    ただし**本人には本文を出す**。自分が書いた文章であり、確認できないと
 *    編集もできない。呼び出し側がカードと本文を並べ、非公開なら
 *    「非公開」バッジを添える。
 * 4. それ以外（coordinate など）は従来どおり、本文があれば `prompt`。
 */
export function getPostPromptDisplayMode(
  record: PromptDisplayRecord,
  options?: { isOwner?: boolean }
): PostPromptDisplayMode {
  if (record.source_post_id) {
    return "source_reference";
  }

  if (shouldHidePromptForGenerationType(record.generation_type)) {
    return "one_tap_style";
  }

  if (record.generation_type === "free" && !options?.isOwner) {
    return "source_reference";
  }

  return record.prompt.trim().length > 0 ? "prompt" : "none";
}

/**
 * 参照カードと本文を並べて出すか。
 *
 * `/free` の root 投稿を本人が見ている場合だけ true。利用数はカードにしか
 * 出ないため、作者が「何人が使ったか」を見られるようにする一方、
 * 自分の本文もその場で確認できるようにする。
 */
export function shouldShowOwnerPromptWithCard(
  record: PromptDisplayRecord,
  options?: { isOwner?: boolean }
): boolean {
  return (
    !!options?.isOwner &&
    !record.source_post_id &&
    record.generation_type === "free"
  );
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

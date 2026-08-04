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
 * 3. `/free` の root 投稿は**公開・非公開を問わず**参照カードを出す。
 *    入口が公開設定で変わると分かりにくいため、生成の導線は1つに寄せている。
 *
 *    そのうえで本文を併記するかは公開設定で分ける。
 *    - 公開: カード＋本文。公開している以上、読める場所が要る
 *    - 非公開: カードのみ。ただし**本人には本文を出す**（自分が書いた文章で、
 *      確認できないと編集もできない）
 *
 *    併記する場合、この関数は `prompt` を返し、カードは
 *    `shouldShowPromptWithCard` を見た呼び出し側が本文の上へ並べる。
 * 4. それ以外（coordinate など）は従来どおり、本文があれば `prompt`。
 *
 * `isModerator`（運営）は本文の併記について本人と同じ扱いにする（REQ-018）。
 * プロンプトは通報対応の判断材料そのもので、画像だけで判断させない。
 * ただし派生投稿は運営でも参照カードのまま。派生投稿自身は本文を所有して
 * おらず（author secret が無い）、出すべき本文は原作の詳細で見る。
 * one_tap_style も運営資産のプリセットカードのままにする（全文は
 * admin のプリセット管理画面が正）。
 */
export function getPostPromptDisplayMode(
  record: PromptDisplayRecord,
  options?: { isOwner?: boolean; isModerator?: boolean }
): PostPromptDisplayMode {
  if (record.source_post_id) {
    return "source_reference";
  }

  if (shouldHidePromptForGenerationType(record.generation_type)) {
    return "one_tap_style";
  }

  if (record.generation_type === "free") {
    // 本文を併記しない場合はカードだけ。本文の有無では決めない
    // （本人以外の本文は payload に載せず、必要になってから取りに行くため）。
    return shouldShowPromptWithCard(record, options) ? "prompt" : "source_reference";
  }

  return record.prompt.trim().length > 0 ? "prompt" : "none";
}

/**
 * 参照カードと本文を並べて出すか。
 *
 * `/free` の root 投稿で、本人が見ているか、プロンプトを公開しているとき。
 *
 * 公開しているなら本文の読める場所が要る。コピーボタンだけだと、貼り付け先を
 * 用意しないと中身が分からない。
 *
 * 本人には公開設定によらず出す。利用数はカードにしか出ないので作者に見せつつ、
 * 自分の本文もその場で確認できるようにする。
 */
export function shouldShowPromptWithCard(
  record: PromptDisplayRecord,
  options?: { isOwner?: boolean; isModerator?: boolean }
): boolean {
  if (record.source_post_id || record.generation_type !== "free") {
    return false;
  }
  return (
    !!options?.isOwner ||
    !!options?.isModerator ||
    record.prompt_visibility !== "private"
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

type ListPromptRecord = PromptProtectedRecord &
  Pick<GeneratedImageRecord, "prompt_visibility">;

/**
 * 一覧 payload から `/free` の本文を落とす。
 *
 * フィード・プロフィールの一覧はプロンプト欄を持たないのに、payload には
 * author secret から解決した本文が載っていた。画面に出なくても devtools で
 * 読めるため、非公開プロンプトがここから漏れる。
 *
 * 公開・非公開を問わず落とす。公開でもフォロワー限定の開示であり、
 * 一覧のキャッシュは閲覧者を跨いで共有され得るため、閲覧者ごとの
 * 出し分けはできない。本文が要る画面（詳細・シート・コピー）は
 * `/api/posts/[id]/prompt-text` かオーナー向け経路で取る。
 *
 * coordinate は従来どおり残す。一覧カードの alt フォールバックが使う
 * ことがあり、フォローゲートは詳細画面の伏字が担っている。
 */
export function stripFreePromptsForList<T extends ListPromptRecord>(
  records: T[]
): T[] {
  return records.map((record) =>
    record.generation_type === "free" && record.prompt !== ""
      ? { ...record, prompt: "" }
      : record
  );
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

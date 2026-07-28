/**
 * 執行ポリシーカタログ（版管理あり）
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md ADR-003
 *
 * `REPORT_TAXONOMY` は「ユーザーが通報時に選ぶ語彙」であり、そのままでは
 * 「どのガイドライン条項に違反したか」を説明できない（DSA 第17条3項(e) の
 * 「契約上の根拠」）。そこで執行側の語彙として本カタログを分離する。
 *
 * 判定時に `code` と `version` を `moderation_audit_logs` に保存するため、
 * ガイドラインを改定しても「判定当時に適用した条項」を後から確認できる。
 * 文言を変更したポリシーは `version` を上げること（過去の判定表示は変わらない）。
 */

import { REPORT_TAXONOMY } from "./report-taxonomy";

/** ガイドライン本文のセクション slug。`/community-guidelines#<anchor>` で参照する。 */
export type ModerationPolicyAnchor =
  | "guidelines-prohibited-absolute"
  | "guidelines-prohibited-general"
  | "guidelines-nsfw"
  | "guidelines-ip";

export interface ModerationPolicy {
  /** 判定ログに保存する安定コード。`{category}.{subcategory}` 形式。 */
  code: string;
  /** 文言の版。ポリシーの意味を変えたら上げる。 */
  version: string;
  /** ガイドライン該当条項へのアンカー。 */
  anchor: ModerationPolicyAnchor;
  /** 通報タクソノミのカテゴリ ID（管理画面の絞り込み用）。 */
  categoryId: string;
  /** 通報タクソノミのサブカテゴリ ID。 */
  subcategoryId: string;
  /**
   * true のとき、投稿者向け画面でもサムネイルを再表示しない。
   * 重大な安全カテゴリで、削除対象画像を再提示しないための指定。
   */
  hideThumbnail: boolean;
}

const POLICY_VERSION = "2026-07-28";

/**
 * サムネイルを再表示しない重大カテゴリ。
 * 児童性的搾取・性的搾取・残虐描写・動物虐待・自傷助長を対象とする。
 */
const HIDE_THUMBNAIL_SUBCATEGORIES = new Set<string>([
  "minor_sexual",
  "sexual_exploitation",
  "gore",
  "cruelty",
  "animal_abuse",
  "self_harm",
]);

/** サブカテゴリ ID からガイドライン条項へのマッピング。 */
const ANCHOR_BY_SUBCATEGORY: Record<string, ModerationPolicyAnchor> = {
  // 5. 知的財産権の尊重
  copyright: "guidelines-ip",
  trademark: "guidelines-ip",
  publicity: "guidelines-ip",
  // 2. 絶対に禁止されるコンテンツ
  minor_sexual: "guidelines-prohibited-absolute",
  sexual_exploitation: "guidelines-prohibited-absolute",
  // 4. センシティブ／NSFW コンテンツの取扱い
  adult_sexual: "guidelines-nsfw",
};

function resolveAnchor(subcategoryId: string): ModerationPolicyAnchor {
  // 明示マッピングが無いものは「3. 一般的な禁止事項」に寄せる
  return ANCHOR_BY_SUBCATEGORY[subcategoryId] ?? "guidelines-prohibited-general";
}

/**
 * 執行ポリシーの一覧。`REPORT_TAXONOMY` から機械的に導出することで、
 * 通報カテゴリと執行カテゴリの取り違えを防ぐ。
 */
export const MODERATION_POLICY_CATALOG: readonly ModerationPolicy[] =
  REPORT_TAXONOMY.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      code: `${category.id}.${subcategory.id}`,
      version: POLICY_VERSION,
      anchor: resolveAnchor(subcategory.id),
      categoryId: category.id as string,
      subcategoryId: subcategory.id as string,
      hideThumbnail: HIDE_THUMBNAIL_SUBCATEGORIES.has(subcategory.id),
    }))
  );

const POLICY_BY_CODE = new Map(
  MODERATION_POLICY_CATALOG.map((policy) => [policy.code, policy])
);

export function findModerationPolicy(
  code: string | null | undefined
): ModerationPolicy | null {
  if (!code) return null;
  return POLICY_BY_CODE.get(code) ?? null;
}

export function isValidModerationPolicyCode(code: string): boolean {
  return POLICY_BY_CODE.has(code);
}

/** snake_case を PascalCase にする（`spam_fraud` → `SpamFraud`）。 */
function toPascalCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * ポリシーの表示ラベルに使う i18n キーを返す。
 *
 * `messages/*.ts` の `moderation` ブロックには通報ダイアログ用の
 * `categoryRights` / `subcategoryCopyright` 等が**全15ロケール分すでに存在する**ため、
 * 執行ポリシー専用のキーを19件×15ロケール新設せず、これを再利用する。
 */
export function getModerationPolicyLabelKeys(
  code: string | null | undefined
): { categoryKey: string; subcategoryKey: string } | null {
  const policy = findModerationPolicy(code);
  if (!policy) return null;
  return {
    categoryKey: `category${toPascalCase(policy.categoryId)}`,
    subcategoryKey: `subcategory${toPascalCase(policy.subcategoryId)}`,
  };
}

/**
 * 判定ログに保存された code から、サムネイルを隠すべきかを判定する。
 * カタログから消えた古い code は「不明」として安全側（非表示）に倒す。
 */
export function shouldHideThumbnailForPolicy(
  code: string | null | undefined
): boolean {
  if (!code) return false;
  const policy = POLICY_BY_CODE.get(code);
  return policy ? policy.hideThumbnail : true;
}

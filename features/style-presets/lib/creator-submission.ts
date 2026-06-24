import { z } from "zod";

/**
 * クリエイター提供プロンプト 申請(Phase 1)の入力スキーマと定数。
 * 計画書: docs/planning/creator-prompt-submission-plan.md
 *
 * - 公開成果物は style_preset。提供 prompt は styling_prompt に保存(公開 read で除外=秘匿)。
 * - 対応モデル(openai/gemini)で自動プレビュー生成、推奨モデルを1つ指定可。
 * - 同意は全項目 true 必須(DB の submit_creator_style_preset RPC でも再検証)。
 * - サムネは 3:4(home の Style カルーセル + /style と統一)。
 */

export const CREATOR_PROMPT_PROVIDERS = ["openai", "gemini"] as const;
export type CreatorPromptProvider = (typeof CREATOR_PROMPT_PROVIDERS)[number];

/**
 * 提供プロンプトの投入先カテゴリ(クリエイターが申請時に選択)。
 * - character_remix(アレンジ): アップロードしたイラストそのものをイメージに沿って変身させる
 * - character_coordinate(テイスト): アップロードしたキャラの衣装や背景を変更する
 * いずれも raw モード(skip_base_prefix)で、背景は本文プロンプトに含める。
 */
export const CREATOR_PROMPT_CATEGORY_KEYS = [
  "character_remix",
  "character_coordinate",
] as const;
export type CreatorPromptCategoryKey =
  (typeof CREATOR_PROMPT_CATEGORY_KEYS)[number];

export const CREATOR_PROMPT_TITLE_MAX_LENGTH = 60;
export const CREATOR_PROMPT_BODY_MAX_LENGTH = 4000;

/** サムネのアスペクト比(/style・home の Style カルーセルと統一)。 */
export const CREATOR_PROMPT_THUMBNAIL_ASPECT = "3:4" as const;
/** 推奨サムネ寸法(最小 768px 要件を満たす 3:4)。クライアント表示用ガイダンス。 */
export const CREATOR_PROMPT_THUMBNAIL_RECOMMENDED = {
  width: 900,
  height: 1200,
} as const;

/**
 * 同意項目(全 true 必須)。既存 Creator Looks の 5 項目に「prompt_original
 * (プロンプトは自作・権利クリア)」を1つ追加(ユーザー合意)。
 */
export const creatorPromptConsentsSchema = z.object({
  copyright: z.literal(true),
  third_party_ip: z.literal(true),
  secondary_use: z.literal(true),
  promo_use: z.literal(true),
  no_sensitive: z.literal(true),
  prompt_original: z.literal(true),
  version: z.string().min(1).default("1.0"),
  acknowledged_at: z.string().optional(),
});
export type CreatorPromptConsents = z.infer<typeof creatorPromptConsentsSchema>;

/** フォームの全同意チェック制御に使うキー一覧(version/acknowledged_at は除く)。 */
export const CREATOR_PROMPT_CONSENT_KEYS = [
  "copyright",
  "third_party_ip",
  "secondary_use",
  "promo_use",
  "no_sensitive",
  "prompt_original",
] as const;
export type CreatorPromptConsentKey = (typeof CREATOR_PROMPT_CONSENT_KEYS)[number];

/**
 * 申請本文(thumbnail は multipart 側で別処理。本スキーマは JSON フィールドを検証)。
 */
export const creatorPromptSubmissionSchema = z
  .object({
    title: z.string().trim().min(1).max(CREATOR_PROMPT_TITLE_MAX_LENGTH),
    prompt: z.string().trim().min(1).max(CREATOR_PROMPT_BODY_MAX_LENGTH),
    categoryKey: z.enum(CREATOR_PROMPT_CATEGORY_KEYS),
    targetProviders: z.array(z.enum(CREATOR_PROMPT_PROVIDERS)).min(1),
    recommendedProvider: z.enum(CREATOR_PROMPT_PROVIDERS).optional().nullable(),
    consents: creatorPromptConsentsSchema,
  })
  .superRefine((data, ctx) => {
    // 推奨モデルは対応モデルに含めること。
    if (
      data.recommendedProvider &&
      !data.targetProviders.includes(data.recommendedProvider)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedProvider"],
        message: "推奨モデルは対応モデルの中から選んでください",
      });
    }
    // 対応モデルの重複排除(UI からの二重送信ガード)。
    const unique = new Set(data.targetProviders);
    if (unique.size !== data.targetProviders.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetProviders"],
        message: "対応モデルが重複しています",
      });
    }
  });

export type CreatorPromptSubmissionInput = z.infer<
  typeof creatorPromptSubmissionSchema
>;

/** 全同意が承諾済みか(フォームの送信可否制御に使う)。 */
export function isAllCreatorPromptConsentsAcknowledged(
  state: Partial<Record<CreatorPromptConsentKey, boolean>>,
): boolean {
  return CREATOR_PROMPT_CONSENT_KEYS.every((key) => state[key] === true);
}

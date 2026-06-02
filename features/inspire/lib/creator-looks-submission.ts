/**
 * Creator Looks 投稿フォーム関連の共通スキーマ・型
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-001, REQ-013
 *
 * フォーム / API route / テスト で共有する純粋データ層。
 */

import { z } from "zod";

export const SUBMISSION_SOURCES = [
  "self_created",
  "self_photographed",
  "licensed_other",
] as const;

export type SubmissionSource = (typeof SUBMISSION_SOURCES)[number];

/**
 * 同意 5 項目。すべて true でなければ pending 昇格できない (= DB CHECK でも強制)。
 */
export const submissionConsentsSchema = z
  .object({
    copyright: z.literal(true),
    third_party_ip: z.literal(true),
    secondary_use: z.literal(true),
    promo_use: z.literal(true),
    no_sensitive: z.literal(true),
    version: z.string().min(1).default("1.0"),
    acknowledged_at: z.string().optional(),
  })
  .strict();

export type SubmissionConsents = z.infer<typeof submissionConsentsSchema>;

/**
 * 投稿時にクライアントから送る Creator Looks 用追加フィールドのスキーマ。
 * preview-generation handler が受け取る。
 */
export const creatorLooksFieldsSchema = z.object({
  is_creator_looks: z.literal(true),
  submission_source: z.enum(SUBMISSION_SOURCES),
  submission_consents: submissionConsentsSchema,
});

export type CreatorLooksFields = z.infer<typeof creatorLooksFieldsSchema>;

/**
 * 5 つの consent が「全て true」かを軽量に確認するヘルパ。
 * フォーム側の disabled 制御に使う (= 入力途中の partial state でも安全)。
 */
export function isAllConsentsAcknowledged(
  state: Partial<Record<keyof SubmissionConsents, unknown>>,
): boolean {
  return (
    state.copyright === true &&
    state.third_party_ip === true &&
    state.secondary_use === true &&
    state.promo_use === true &&
    state.no_sensitive === true
  );
}

export const SUBMISSION_CONSENTS_VERSION = "1.0";

/**
 * Form 側の Partial<boolean> state から zod 用の literal(true) 型に narrow した payload を組み立てる。
 *
 * 呼出側責任: state の 5 項目すべてが true である状態でのみ呼ぶこと (= isAllConsentsAcknowledged で
 * 事前に gate される前提)。false の項目が混ざっていると、zod validation で reject される。
 * acknowledged_at はサーバ側で再評価される (= クライアント時刻は記念用)。
 */
export function buildSubmissionConsents(state: {
  copyright: boolean;
  third_party_ip: boolean;
  secondary_use: boolean;
  promo_use: boolean;
  no_sensitive: boolean;
}): SubmissionConsents {
  return {
    copyright: state.copyright as true,
    third_party_ip: state.third_party_ip as true,
    secondary_use: state.secondary_use as true,
    promo_use: state.promo_use as true,
    no_sensitive: state.no_sensitive as true,
    version: SUBMISSION_CONSENTS_VERSION,
    acknowledged_at: new Date().toISOString(),
  };
}

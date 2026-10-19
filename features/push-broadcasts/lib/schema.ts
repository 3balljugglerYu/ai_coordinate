import { z } from "zod";

/**
 * 運営お知らせ・全体配信のプッシュ通知（admin_push_broadcasts）。
 * 計画書: docs/planning/push-notifications-implementation-plan.md Phase 5
 * 表: supabase/migrations/20261019120000_add_admin_push_broadcasts.sql
 */

/**
 * sent は「宛先ごとの送信待ちを積み終えた」で、届いたかどうかではない（送れた数は
 * push_outbox で数える）。expired は送信日時から 1 時間たっても積み終えられず、
 * （残りを）送らなかったもの。
 */
export const PUSH_BROADCAST_STATUS_VALUES = [
  "scheduled",
  "sending",
  "sent",
  "canceled",
  "expired",
] as const;

export type PushBroadcastStatus = (typeof PUSH_BROADCAST_STATUS_VALUES)[number];

/** DB の CHECK と同じ上限 */
export const PUSH_BROADCAST_TITLE_MAX = 120;
export const PUSH_BROADCAST_BODY_MAX = 300;
export const PUSH_BROADCAST_URL_MAX = 500;
/** お知らせ本文から作るプッシュ本文の長さ（通知の表示で切れる前提で短め） */
export const ANNOUNCEMENT_PUSH_BODY_MAX = 100;

/**
 * 空白（全角・ゼロ幅・BOM を含む）・制御文字（C0/C1）・バックスラッシュ
 * （`/\evil.example` は別のサイトと読まれる）。DB の CHECK も同じ文字を断る
 */
const URL_FORBIDDEN_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\s\u200B\uFEFF\\]/;

/**
 * 押したときの行き先。アプリ内のパス（`/` 始まり、`//` は不可）か https の URL。
 * 空白・制御文字・`\` は使えない（お知らせのリンクの isSafeAnnouncementLinkUrl と同じ考え方で、
 * こちらは C1 制御文字・ゼロ幅の空白・BOM も断る分だけ厳しい）。
 * DB の CHECK も同じ文字を断る（https の URL として読めるかは API だけで確かめる）。
 */
export function isValidPushBroadcastUrl(value: string): boolean {
  if (value.length > PUSH_BROADCAST_URL_MAX) {
    return false;
  }
  if (URL_FORBIDDEN_CHARACTER_PATTERN.test(value)) {
    return false;
  }
  if (value === "/") {
    return true;
  }
  if (/^\/[^/]/.test(value)) {
    return true;
  }
  if (!value.startsWith("https://")) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const pushBroadcastCreateSchema = z.object({
  title: z.string().trim().min(1).max(PUSH_BROADCAST_TITLE_MAX),
  body: z.string().trim().max(PUSH_BROADCAST_BODY_MAX).default(""),
  url: z
    .string()
    .trim()
    .max(PUSH_BROADCAST_URL_MAX)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || isValidPushBroadcastUrl(value), {
      message: "行き先は / から始まるパスか https:// の URL にしてください",
    }),
  /** null・未指定ならすぐ送る */
  sendAt: z.string().datetime().nullable().optional(),
});

export type PushBroadcastCreateInput = z.infer<typeof pushBroadcastCreateSchema>;

export interface PushBroadcast {
  id: string;
  title: string;
  body: string;
  url: string | null;
  announcementId: string | null;
  sendAt: string;
  status: PushBroadcastStatus;
  enqueuedCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  canceledAt: string | null;
}

/** push_outbox の状態別件数（7 日で掃除されるので古い配信は 0 になる） */
export interface PushBroadcastDeliveryStats {
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
}

export function emptyDeliveryStats(): PushBroadcastDeliveryStats {
  return { pending: 0, sent: 0, skipped: 0, failed: 0 };
}

export interface PushBroadcastAdminView extends PushBroadcast {
  /** 件数を読めなかったときは null（0 と見分ける） */
  stats: PushBroadcastDeliveryStats | null;
  sendAtDisplay: string;
  statusLabel: string;
  statusClassName: string;
}

/** お知らせの一覧・フォームに出す、紐づく配信の要約 */
export interface AnnouncementPushSummary {
  id: string;
  status: PushBroadcastStatus;
  sendAt: string;
  enqueuedCount: number;
  /**
   * まだ送り終えていない送信待ちの数（表示の「送信中／送信済み」の判定に使う）。
   * 件数を読めなかったときは null
   */
  pendingCount: number | null;
}

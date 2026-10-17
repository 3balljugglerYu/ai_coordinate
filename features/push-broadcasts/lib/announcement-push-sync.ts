import type { AnnouncementStatus } from "@/features/announcements/lib/schema";
import {
  ANNOUNCEMENT_PUSH_BODY_MAX,
  PUSH_BROADCAST_TITLE_MAX,
  type PushBroadcastStatus,
} from "./schema";

/**
 * 運営お知らせを保存したときに、紐づくプッシュ配信をどうするかを決める。
 *
 * 1 つのお知らせにつき配信は 1 行（DB の uq_admin_push_broadcasts_announcement）。
 * 編集のたびに増やさず、送る前（scheduled / canceled）の行だけを書き換える。
 *
 * | 今の配信                 | 保存した内容             | すること                         |
 * |--------------------------|--------------------------|----------------------------------|
 * | 無い                     | 公開 ＋ 送る             | 作る（send_at = 公開日時）       |
 * | 無い                     | それ以外                 | 何もしない                       |
 * | scheduled                | 公開 ＋ 送る             | 公開日時・表示文を合わせる       |
 * | scheduled                | 下書き または 送らない   | 取り消す                         |
 * | canceled                 | 公開 ＋ 送る             | 予約に戻す（公開日時・表示文も） |
 * | canceled                 | それ以外                 | 何もしない                       |
 * | sending / sent / expired | 何でも                   | 何もしない（送ったもの・期限を過ぎたものは戻せない）|
 *
 * send_at は公開日時。ただし過去の公開日時（公開済みのお知らせで後から「送る」に
 * したときなど）は保存した今にする。過去のままだと、DB は送信日時から 1 時間たった
 * 配信を古いものとして送らない（expired）ため。
 *
 * `sendPush` が未指定（古い画面からの保存など）のときは「今の状態を保つ」＝
 * 有効な予約があれば送る扱い、無ければ送らない扱いにする。
 */

export interface ExistingAnnouncementPush {
  id: string;
  status: PushBroadcastStatus;
}

export interface AnnouncementPushContent {
  title: string;
  body: string;
  sendAt: string;
}

export type AnnouncementPushAction =
  | { type: "none" }
  | { type: "create"; content: AnnouncementPushContent }
  | { type: "reschedule"; id: string; content: AnnouncementPushContent }
  | { type: "cancel"; id: string };

export interface AnnouncementPushSyncInput {
  existing: ExistingAnnouncementPush | null;
  sendPush: boolean | undefined;
  announcement: {
    title: string;
    bodyText: string;
    status: AnnouncementStatus;
    publishAt: string | null;
  };
  /** 保存した時刻（テスト用。既定は今） */
  now?: Date;
}

/** 送信日時。公開日時が過去なら今にする */
function resolveSendAt(publishAt: string, now: Date): string {
  const publishMs = Date.parse(publishAt);
  if (Number.isNaN(publishMs) || publishMs >= now.getTime()) {
    return publishAt;
  }
  return now.toISOString();
}

/** お知らせ本文からプッシュ本文（1 行・短め）を作る */
export function buildAnnouncementPushBody(bodyText: string): string {
  const singleLine = bodyText.replace(/\s+/g, " ").trim();
  if (singleLine.length <= ANNOUNCEMENT_PUSH_BODY_MAX) {
    return singleLine;
  }
  return `${singleLine.slice(0, ANNOUNCEMENT_PUSH_BODY_MAX - 1)}…`;
}

export function decideAnnouncementPushAction(
  input: AnnouncementPushSyncInput
): AnnouncementPushAction {
  const { existing, announcement } = input;
  const wantsPush =
    input.sendPush ?? (existing !== null && existing.status === "scheduled");
  const shouldSend =
    wantsPush &&
    announcement.status === "published" &&
    announcement.publishAt !== null;

  const content: AnnouncementPushContent | null = shouldSend
    ? {
        title: announcement.title.trim().slice(0, PUSH_BROADCAST_TITLE_MAX),
        body: buildAnnouncementPushBody(announcement.bodyText),
        sendAt: resolveSendAt(
          announcement.publishAt as string,
          input.now ?? new Date()
        ),
      }
    : null;

  if (!existing) {
    return content ? { type: "create", content } : { type: "none" };
  }

  if (
    existing.status === "sending" ||
    existing.status === "sent" ||
    existing.status === "expired"
  ) {
    return { type: "none" };
  }

  if (content) {
    return { type: "reschedule", id: existing.id, content };
  }

  if (existing.status === "scheduled") {
    return { type: "cancel", id: existing.id };
  }

  return { type: "none" };
}

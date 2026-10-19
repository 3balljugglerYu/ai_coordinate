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
 * | sending / sent / expired | チェックを変えない       | 何もしない（送ったもの・期限を過ぎたものは戻せない）|
 * | sending / sent / expired | チェックを変えた         | 変えられないと知らせる（locked）  |
 *
 * send_at は公開日時。ただし過去の公開日時（公開済みのお知らせで後から「送る」に
 * したときなど）は保存した今にする。過去のままだと、DB は送信日時から 1 時間たった
 * 配信を古いものとして送らない（expired）ため。
 *
 * `sendPush` が未指定のときは「今の状態を保つ」＝有効な予約があれば送る扱い、
 * 無ければ送らない扱いにする。管理画面はチェックを変えたときだけ `sendPush` を送る
 * （開いたままの古い画面の値で、取り消し・復活が黙って起きないように）。
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
  /** 送信が始まった・済んだ・期限切れの配信を、チェックを変えて取り消し／送り直ししようとした */
  | {
      type: "locked";
      status: "sending" | "sent" | "expired";
      requested: "send" | "cancel";
    }
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

/**
 * お知らせ本文からプッシュ本文（1 行・短め）を作る。
 * 文字で数えて文字で切る（UTF-16 の length/slice だと絵文字の途中で切れ、
 * 片割れのサロゲートが残って DB への保存が失敗する）。
 */
export function buildAnnouncementPushBody(bodyText: string): string {
  const characters = Array.from(bodyText.replace(/\s+/g, " ").trim());
  if (characters.length <= ANNOUNCEMENT_PUSH_BODY_MAX) {
    return characters.join("");
  }
  return `${characters.slice(0, ANNOUNCEMENT_PUSH_BODY_MAX - 1).join("")}…`;
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
        title: Array.from(announcement.title.trim())
          .slice(0, PUSH_BROADCAST_TITLE_MAX)
          .join(""),
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
    // 送ったもの・期限を過ぎたものは戻せない。チェックを変えて頼まれた（外した＝取り消し、
    // 入れた＝もう一度送る）ときだけ、黙らずに知らせる。ふつうの編集・下書きへの
    // 切り替えは何もしない（チェックに触れていないのに毎回警告しない）
    return input.sendPush === undefined
      ? { type: "none" }
      : { type: "locked", status: existing.status, requested: input.sendPush ? "send" : "cancel" };
  }

  if (content) {
    return { type: "reschedule", id: existing.id, content };
  }

  if (existing.status === "scheduled") {
    return { type: "cancel", id: existing.id };
  }

  return { type: "none" };
}

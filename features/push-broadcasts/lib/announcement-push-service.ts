import type { AnnouncementAdminView } from "@/features/announcements/lib/schema";
import {
  decideAnnouncementPushAction,
  type AnnouncementPushAction,
} from "./announcement-push-sync";
import {
  applyAnnouncementPushAction,
  getAnnouncementPushSummaries,
} from "./push-broadcast-repository";
import type { AnnouncementPushSummary } from "./schema";

export interface AnnouncementPushSyncResult {
  action: AnnouncementPushAction["type"];
  push: AnnouncementPushSummary | null;
  /** お知らせ自体は保存できたが、プッシュの予約だけ失敗したときの文言 */
  error?: string;
}

/**
 * お知らせを保存した直後に、紐づくプッシュ配信を合わせる。
 * お知らせの保存は済んでいるので、ここで失敗しても例外にせず error で返す
 * （例外にすると管理画面が「保存に失敗」と出し、作り直しで二重のお知らせになる）。
 */
export async function syncAnnouncementPush(params: {
  announcement: {
    id: string;
    title: string;
    bodyText: string;
    status: AnnouncementAdminView["status"];
    publishAt: string | null;
  };
  sendPush: boolean | undefined;
  adminUserId: string;
}): Promise<AnnouncementPushSyncResult> {
  const { announcement } = params;
  let action: AnnouncementPushAction = { type: "none" };
  try {
    const existing =
      (await getAnnouncementPushSummaries([announcement.id])).get(
        announcement.id
      ) ?? null;

    action = decideAnnouncementPushAction({
      existing,
      sendPush: params.sendPush,
      announcement,
    });

    if (action.type === "none") {
      return { action: action.type, push: existing };
    }

    await applyAnnouncementPushAction(
      announcement.id,
      action,
      params.adminUserId
    );

    const push =
      (await getAnnouncementPushSummaries([announcement.id])).get(
        announcement.id
      ) ?? null;
    return { action: action.type, push };
  } catch (error) {
    console.error("[push-broadcasts] announcement sync error:", error);
    if (params.sendPush !== true && action.type === "none") {
      // 送るよう頼まれていない保存で、状態を読めなかっただけ。画面には出さない
      return { action: action.type, push: null };
    }
    return {
      action: action.type,
      push: null,
      error:
        error instanceof Error
          ? error.message
          : "プッシュ通知の予約に失敗しました",
    };
  }
}

/** お知らせの一覧に、紐づくプッシュ配信の要約を付ける */
export async function attachAnnouncementPushSummaries(
  announcements: AnnouncementAdminView[]
): Promise<AnnouncementAdminView[]> {
  let summaries = new Map<string, AnnouncementPushSummary>();
  try {
    summaries = await getAnnouncementPushSummaries(
      announcements.map((announcement) => announcement.id)
    );
  } catch (error) {
    // 補助情報。読めなくてもお知らせの一覧は出す
    console.error("[push-broadcasts] attach summaries error:", error);
  }
  return announcements.map((announcement) => ({
    ...announcement,
    push: summaries.get(announcement.id) ?? null,
  }));
}

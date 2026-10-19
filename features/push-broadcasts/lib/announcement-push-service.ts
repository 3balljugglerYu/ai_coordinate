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
  /**
   * お知らせ自体は保存できたが、プッシュの予約・変更・取り消しが効かなかったときの文言
   * （画面と監査ログに出す）
   */
  error?: string;
}

/**
 * 予約の変更・取り消しが 0 行で終わったときの文言。読み直した今の状態で書き分ける
 * （保存の直前に送信が始まった・期限切れになった、など）。
 */
export function describeUnappliedAnnouncementPush(
  action: "reschedule" | "cancel",
  current: AnnouncementPushSummary | null
): string {
  if (current?.status === "sending" || current?.status === "sent") {
    return action === "cancel"
      ? "プッシュ通知はすでに送信が始まっていたため、取り消せませんでした"
      : "プッシュ通知はすでに送信が始まっていたため、変更できませんでした（変更前の内容で送られます）";
  }
  if (current?.status === "expired") {
    return "プッシュ通知は送信日時から 1 時間を過ぎて期限切れになっていたため、変更できませんでした";
  }
  return "プッシュ通知の状態が変わっていたため、変更できませんでした。画面を読み込み直して確認してください";
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

  let existing: AnnouncementPushSummary | null;
  try {
    existing =
      (await getAnnouncementPushSummaries([announcement.id])).get(
        announcement.id
      ) ?? null;
  } catch (error) {
    console.error("[push-broadcasts] announcement sync read error:", error);
    // チェックを変えていなくても、題名・公開日時などの変更は予約に合わせる必要がある。
    // 読めなかったときは必ず知らせる
    return {
      action: "none",
      push: null,
      error:
        "プッシュ通知の状態を読めなかったため、予約に変更を反映していません。もう一度保存してください",
    };
  }

  const action = decideAnnouncementPushAction({
    existing,
    sendPush: params.sendPush,
    announcement,
  });

  if (action.type === "none") {
    return { action: action.type, push: existing };
  }
  if (action.type === "locked") {
    return {
      action: action.type,
      push: existing,
      error:
        action.requested === "send"
          ? "このお知らせのプッシュ通知はすでに送っています（送信済み・期限切れ）。もう一度は送れません"
          : action.status === "expired"
            ? "プッシュ通知は期限切れになっていたため、変更できませんでした"
            : "プッシュ通知はすでに送信が始まっていたため、取り消せませんでした",
    };
  }

  let applied: boolean;
  try {
    applied = await applyAnnouncementPushAction(
      announcement.id,
      action,
      params.adminUserId
    );
  } catch (error) {
    console.error("[push-broadcasts] announcement sync write error:", error);
    return {
      action: action.type,
      push: existing,
      error:
        error instanceof Error
          ? error.message
          : "プッシュ通知の予約に失敗しました",
    };
  }

  // 書けたあとの読み直しは表示のためだけ。失敗しても「効かなかった」とは言わない
  let push: AnnouncementPushSummary | null = null;
  try {
    push =
      (await getAnnouncementPushSummaries([announcement.id])).get(
        announcement.id
      ) ?? null;
  } catch (error) {
    console.error("[push-broadcasts] announcement sync re-read error:", error);
  }

  if (!applied && (action.type === "reschedule" || action.type === "cancel")) {
    // 読んでから書くまでのあいだに送信が始まっていた。成功扱いにしない
    return {
      action: action.type,
      push,
      error: describeUnappliedAnnouncementPush(action.type, push),
    };
  }
  return { action: action.type, push };
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

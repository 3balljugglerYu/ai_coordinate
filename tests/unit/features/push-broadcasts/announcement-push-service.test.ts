/**
 * お知らせを保存した直後に、紐づくプッシュ配信を合わせる（syncAnnouncementPush）。
 *
 * 守ること:
 *  - 予約の変更・取り消しが効かなかった（読んでから書くまでのあいだに送信が
 *    始まった・期限切れになった）ときは、成功扱いにせず理由を error で返す
 *    （画面に「保存しました」とだけ出したり、監査ログに取り消したと残したりしない）
 *  - 効いたときは error を返さない
 */

jest.mock("@/features/push-broadcasts/lib/push-broadcast-repository", () => ({
  applyAnnouncementPushAction: jest.fn(),
  getAnnouncementPushSummaries: jest.fn(),
}));

import { syncAnnouncementPush } from "@/features/push-broadcasts/lib/announcement-push-service";
import {
  applyAnnouncementPushAction,
  getAnnouncementPushSummaries,
} from "@/features/push-broadcasts/lib/push-broadcast-repository";
import type {
  AnnouncementPushSummary,
  PushBroadcastStatus,
} from "@/features/push-broadcasts/lib/schema";

const mockApply = applyAnnouncementPushAction as jest.MockedFunction<
  typeof applyAnnouncementPushAction
>;
const mockSummaries = getAnnouncementPushSummaries as jest.MockedFunction<
  typeof getAnnouncementPushSummaries
>;

const ANNOUNCEMENT_ID = "a1";

function summary(
  status: PushBroadcastStatus,
  overrides: Partial<AnnouncementPushSummary> = {}
): AnnouncementPushSummary {
  return {
    id: "b1",
    status,
    sendAt: "2026-10-20T11:00:00.000Z",
    enqueuedCount: 0,
    pendingCount: 0,
    ...overrides,
  };
}

/** 1 回目（判定の前）と 2 回目（書いたあと）の読み取り結果 */
function summariesInOrder(
  before: AnnouncementPushSummary | null,
  after: AnnouncementPushSummary | null
) {
  mockSummaries
    .mockResolvedValueOnce(
      new Map(before ? [[ANNOUNCEMENT_ID, before]] : [])
    )
    .mockResolvedValueOnce(new Map(after ? [[ANNOUNCEMENT_ID, after]] : []));
}

function params(
  overrides: {
    status?: "draft" | "published";
    sendPush?: boolean;
    publishAt?: string | null;
  } = {}
) {
  return {
    announcement: {
      id: ANNOUNCEMENT_ID,
      title: "ハロウィン企画",
      bodyText: "うちの子のベストショットを投稿しよう",
      status: overrides.status ?? ("published" as const),
      publishAt:
        "publishAt" in overrides
          ? (overrides.publishAt ?? null)
          : "2099-10-20T11:00:00.000Z",
    },
    sendPush: "sendPush" in overrides ? overrides.sendPush : true,
    adminUserId: "admin-1",
  };
}

beforeEach(() => {
  // 前のテストで使わなかった mockResolvedValueOnce を持ち越さない
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("syncAnnouncementPush: 予約の変更・取り消しが効かなかったとき", () => {
  test("取り消しが 0 行で、送信が始まっていたら「取り消せませんでした」を返す", async () => {
    summariesInOrder(summary("scheduled"), summary("sent", { enqueuedCount: 3 }));
    mockApply.mockResolvedValue(false);

    const result = await syncAnnouncementPush(
      params({ status: "draft", publishAt: null })
    );

    expect(mockApply).toHaveBeenCalledWith(
      ANNOUNCEMENT_ID,
      { type: "cancel", id: "b1" },
      "admin-1"
    );
    expect(result).toEqual({
      action: "cancel",
      push: summary("sent", { enqueuedCount: 3 }),
      error: "プッシュ通知はすでに送信が始まっていたため、取り消せませんでした",
    });
  });

  test("予約の変更が 0 行で、送信中なら「変更前の内容で送られます」を返す", async () => {
    summariesInOrder(summary("scheduled"), summary("sending"));
    mockApply.mockResolvedValue(false);

    const result = await syncAnnouncementPush(params());

    expect(mockApply).toHaveBeenCalledWith(
      ANNOUNCEMENT_ID,
      expect.objectContaining({ type: "reschedule", id: "b1" }),
      "admin-1"
    );
    expect(result.action).toBe("reschedule");
    expect(result.error).toBe(
      "プッシュ通知はすでに送信が始まっていたため、変更できませんでした（変更前の内容で送られます）"
    );
  });

  test("期限切れになっていたら、期限切れだったと返す", async () => {
    summariesInOrder(summary("scheduled"), summary("expired"));
    mockApply.mockResolvedValue(false);

    const result = await syncAnnouncementPush(params({ sendPush: false }));

    expect(result.action).toBe("cancel");
    expect(result.error).toBe(
      "プッシュ通知は送信日時から 1 時間を過ぎて期限切れになっていたため、変更できませんでした"
    );
  });

  test("読み直すと配信が無かった（消えていた）ら、読み込み直しを促す", async () => {
    summariesInOrder(summary("canceled"), null);
    mockApply.mockResolvedValue(false);

    const result = await syncAnnouncementPush(params());

    expect(result).toEqual({
      action: "reschedule",
      push: null,
      error:
        "プッシュ通知の状態が変わっていたため、変更できませんでした。画面を読み込み直して確認してください",
    });
  });
});

describe("syncAnnouncementPush: 効いたとき・失敗したとき", () => {
  test("取り消せたら error を返さない", async () => {
    summariesInOrder(summary("scheduled"), summary("canceled"));
    mockApply.mockResolvedValue(true);

    const result = await syncAnnouncementPush(params({ sendPush: false }));

    expect(result).toEqual({ action: "cancel", push: summary("canceled") });
  });

  test("作れたら error を返さない", async () => {
    summariesInOrder(null, summary("scheduled"));
    mockApply.mockResolvedValue(true);

    const result = await syncAnnouncementPush(params());

    expect(result).toEqual({ action: "create", push: summary("scheduled") });
  });

  test("書き込みが例外になったら、その文言を error で返す（お知らせの保存は成功のまま）", async () => {
    summariesInOrder(null, null);
    mockApply.mockRejectedValue(new Error("プッシュ通知の予約に失敗しました"));

    const result = await syncAnnouncementPush(params());

    expect(result).toEqual({
      action: "create",
      push: null,
      error: "プッシュ通知の予約に失敗しました",
    });
  });

  test("何もしない保存では書き込まない", async () => {
    summariesInOrder(summary("sent"), null);

    const result = await syncAnnouncementPush(params({ sendPush: false }));

    expect(mockApply).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "none", push: summary("sent") });
  });
});

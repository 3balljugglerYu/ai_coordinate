/**
 * 運営配信の状態の表示。
 *
 * 守ること:
 *  - sent は「送信待ちを積み終えた」だけなので、送り終えていない送信待ちが残る間は
 *    「送信済み」ではなく「送信中」と出す（送信関数が止まっているときに誤解させない）
 *  - expired（送信日時から 1 時間たっても積み終えられなかった）は「期限切れ」
 */

import {
  decoratePushBroadcastAdmin,
  describeExpiredPushBroadcast,
  getPushBroadcastStatusLabel,
} from "@/features/push-broadcasts/lib/presentation";
import type { PushBroadcast } from "@/features/push-broadcasts/lib/schema";

function broadcast(overrides: Partial<PushBroadcast> = {}): PushBroadcast {
  return {
    id: "b1",
    title: "ハロウィン企画",
    body: "",
    url: null,
    announcementId: null,
    sendAt: "2026-10-20T11:00:00.000Z",
    status: "sent",
    enqueuedCount: 3,
    createdBy: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    canceledAt: null,
    ...overrides,
  };
}

describe("getPushBroadcastStatusLabel", () => {
  test("sent でも送り終えていない送信待ちがあれば「送信中」", () => {
    expect(getPushBroadcastStatusLabel("sent", 2).label).toBe("送信中");
  });

  test("sent で送信待ちが残っていなければ「送信済み」", () => {
    expect(getPushBroadcastStatusLabel("sent", 0).label).toBe("送信済み");
    expect(getPushBroadcastStatusLabel("sent").label).toBe("送信済み");
  });

  test("expired は「期限切れ」", () => {
    expect(getPushBroadcastStatusLabel("expired", 1).label).toBe("期限切れ");
  });

  test("送信待ちの数で変わるのは sent だけ", () => {
    expect(getPushBroadcastStatusLabel("scheduled", 5).label).toBe("予約中");
    expect(getPushBroadcastStatusLabel("canceled", 5).label).toBe("取り消し");
    expect(getPushBroadcastStatusLabel("sending", 0).label).toBe("送信中");
  });
});

describe("decoratePushBroadcastAdmin", () => {
  test("件数の pending で表示を決める", () => {
    const view = decoratePushBroadcastAdmin(broadcast(), {
      pending: 1,
      sent: 2,
      skipped: 0,
      failed: 0,
    });
    expect(view.statusLabel).toBe("送信中");
    expect(view.stats!.pending).toBe(1);
  });

  test("件数が無ければ状態どおり", () => {
    expect(decoratePushBroadcastAdmin(broadcast(), undefined).statusLabel).toBe(
      "送信済み"
    );
  });
});

describe("describeExpiredPushBroadcast", () => {
  test("1 人も積んでいなければ「送っていません」", () => {
    expect(describeExpiredPushBroadcast(0)).toBe(
      "送信日時から 1 時間以内に送り始められなかったため、送っていません。"
    );
  });

  test("途中まで積んでいたら「残りは送っていません」", () => {
    expect(describeExpiredPushBroadcast(3)).toBe(
      "送信日時から 1 時間以内に送り終えられなかったため、残りは送っていません。"
    );
  });
});

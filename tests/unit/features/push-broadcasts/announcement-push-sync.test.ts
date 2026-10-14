/**
 * 運営お知らせを保存したときに、紐づくプッシュ配信をどうするか。
 *
 * 守ること:
 *  - 1 つのお知らせに配信は 1 つ（編集のたびに作らない）
 *  - 送る前（scheduled / canceled）だけ書き換え、送ったもの（sending / sent）は触らない
 *  - 下書きに戻す・「送る」を外すと、予約は取り消す
 */

import {
  buildAnnouncementPushBody,
  decideAnnouncementPushAction,
  type AnnouncementPushSyncInput,
} from "@/features/push-broadcasts/lib/announcement-push-sync";

const PUBLISH_AT = "2026-10-20T11:00:00.000Z";

function input(
  overrides: Partial<Omit<AnnouncementPushSyncInput, "announcement">> & {
    announcement?: Partial<AnnouncementPushSyncInput["announcement"]>;
  } = {}
): AnnouncementPushSyncInput {
  return {
    existing: overrides.existing ?? null,
    sendPush: "sendPush" in overrides ? overrides.sendPush : true,
    announcement: {
      title: "ハロウィン企画",
      bodyText: "うちの子のベストショットを投稿しよう",
      status: "published",
      publishAt: PUBLISH_AT,
      ...overrides.announcement,
    },
  };
}

describe("decideAnnouncementPushAction", () => {
  test("配信が無く、公開＋送る なら公開日時で作る", () => {
    expect(decideAnnouncementPushAction(input())).toEqual({
      type: "create",
      content: {
        title: "ハロウィン企画",
        body: "うちの子のベストショットを投稿しよう",
        sendAt: PUBLISH_AT,
      },
    });
  });

  test("配信が無く、下書きなら作らない", () => {
    expect(
      decideAnnouncementPushAction(input({ announcement: { status: "draft", publishAt: null } }))
    ).toEqual({ type: "none" });
  });

  test("配信が無く、送らないなら作らない", () => {
    expect(decideAnnouncementPushAction(input({ sendPush: false }))).toEqual({
      type: "none",
    });
  });

  test("予約中で公開日時が変わったら、同じ行の日時を合わせる", () => {
    const later = "2026-10-21T11:00:00.000Z";
    const action = decideAnnouncementPushAction(
      input({
        existing: { id: "b1", status: "scheduled" },
        announcement: { publishAt: later },
      })
    );
    expect(action).toEqual({
      type: "reschedule",
      id: "b1",
      content: expect.objectContaining({ sendAt: later }),
    });
  });

  test("予約中に下書きへ戻したら取り消す", () => {
    expect(
      decideAnnouncementPushAction(
        input({
          existing: { id: "b1", status: "scheduled" },
          announcement: { status: "draft", publishAt: null },
        })
      )
    ).toEqual({ type: "cancel", id: "b1" });
  });

  test("予約中に「送る」を外したら取り消す", () => {
    expect(
      decideAnnouncementPushAction(
        input({ existing: { id: "b1", status: "scheduled" }, sendPush: false })
      )
    ).toEqual({ type: "cancel", id: "b1" });
  });

  test("取り消し済みで、また「送る」にしたら予約に戻す（行は増やさない）", () => {
    expect(
      decideAnnouncementPushAction(input({ existing: { id: "b1", status: "canceled" } }))
    ).toEqual(expect.objectContaining({ type: "reschedule", id: "b1" }));
  });

  test("取り消し済みで送らないままなら何もしない", () => {
    expect(
      decideAnnouncementPushAction(
        input({ existing: { id: "b1", status: "canceled" }, sendPush: false })
      )
    ).toEqual({ type: "none" });
  });

  test.each(["sending", "sent"] as const)(
    "%s の配信は、何を保存しても触らない",
    (status) => {
      expect(
        decideAnnouncementPushAction(
          input({
            existing: { id: "b1", status },
            sendPush: false,
            announcement: { status: "draft", publishAt: null },
          })
        )
      ).toEqual({ type: "none" });
      expect(
        decideAnnouncementPushAction(input({ existing: { id: "b1", status } }))
      ).toEqual({ type: "none" });
    }
  );

  test("sendPush 未指定は今の予約を保つ（予約中なら日時だけ合わせる）", () => {
    expect(
      decideAnnouncementPushAction(
        input({ existing: { id: "b1", status: "scheduled" }, sendPush: undefined })
      )
    ).toEqual(expect.objectContaining({ type: "reschedule", id: "b1" }));
    expect(
      decideAnnouncementPushAction(input({ existing: null, sendPush: undefined }))
    ).toEqual({ type: "none" });
  });
});

describe("buildAnnouncementPushBody", () => {
  test("改行と連続空白を 1 つにまとめる", () => {
    expect(buildAnnouncementPushBody("  一行目\n\n二行目   三 ")).toBe(
      "一行目 二行目 三"
    );
  });

  test("100 文字を超えたら … で切る", () => {
    const body = buildAnnouncementPushBody("あ".repeat(150));
    expect(body).toHaveLength(100);
    expect(body.endsWith("…")).toBe(true);
  });
});

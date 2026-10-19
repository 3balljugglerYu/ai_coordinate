/**
 * 運営お知らせを保存したときに、紐づくプッシュ配信をどうするか。
 *
 * 守ること:
 *  - 1 つのお知らせに配信は 1 つ（編集のたびに作らない）
 *  - 送る前（scheduled / canceled）だけ書き換え、送ったもの（sending / sent）と
 *    期限切れ（expired）は触らない
 *  - 下書きに戻す・「送る」を外すと、予約は取り消す
 *  - 過去の公開日時で送るときは、保存した今を送信日時にする（DB は送信日時から
 *    1 時間たった配信を古いものとして送らないため）
 */

import {
  buildAnnouncementPushBody,
  decideAnnouncementPushAction,
  type AnnouncementPushSyncInput,
} from "@/features/push-broadcasts/lib/announcement-push-sync";

/** 保存した時刻（公開日時 PUBLISH_AT より前） */
const NOW = new Date("2026-10-14T03:00:00.000Z");
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
    now: overrides.now ?? NOW,
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

  test("公開日時が過去なら、保存した今を送信日時にする（作る・予約に戻す）", () => {
    const past = "2026-10-10T11:00:00.000Z";
    expect(
      decideAnnouncementPushAction(input({ announcement: { publishAt: past } }))
    ).toEqual({
      type: "create",
      content: expect.objectContaining({ sendAt: NOW.toISOString() }),
    });
    expect(
      decideAnnouncementPushAction(
        input({
          existing: { id: "b1", status: "canceled" },
          announcement: { publishAt: past },
        })
      )
    ).toEqual({
      type: "reschedule",
      id: "b1",
      content: expect.objectContaining({ sendAt: NOW.toISOString() }),
    });
  });

  test("公開日時がちょうど今なら、その日時のまま", () => {
    const action = decideAnnouncementPushAction(
      input({ announcement: { publishAt: NOW.toISOString() } })
    );
    expect(action).toEqual({
      type: "create",
      content: expect.objectContaining({ sendAt: NOW.toISOString() }),
    });
  });

  test.each(["sending", "sent", "expired"] as const)(
    "%s の配信は、チェックを変えない保存では触らない（下書きにしても警告しない）",
    (status) => {
      expect(
        decideAnnouncementPushAction(
          input({ existing: { id: "b1", status }, sendPush: undefined })
        )
      ).toEqual({ type: "none" });
      expect(
        decideAnnouncementPushAction(
          input({
            existing: { id: "b1", status },
            sendPush: undefined,
            announcement: { status: "draft", publishAt: null },
          })
        )
      ).toEqual({ type: "none" });
    }
  );

  test.each(["sending", "sent", "expired"] as const)(
    "⭐%s の配信でチェックを変えたら（外した・入れた）、変えられないと知らせる",
    (status) => {
      expect(
        decideAnnouncementPushAction(
          input({ existing: { id: "b1", status }, sendPush: false })
        )
      ).toEqual({ type: "locked", status, requested: "cancel" });
      expect(
        decideAnnouncementPushAction(
          input({ existing: { id: "b1", status }, sendPush: true })
        )
      ).toEqual({ type: "locked", status, requested: "send" });
    }
  );

  test("⭐取り消し済みの予約は、チェックを変えない保存では戻さない", () => {
    expect(
      decideAnnouncementPushAction(
        input({ existing: { id: "b1", status: "canceled" }, sendPush: undefined })
      )
    ).toEqual({ type: "none" });
  });

  test("⭐本文は文字で切る（絵文字の途中で切らない）", () => {
    const body = buildAnnouncementPushBody("あ".repeat(98) + "🎃ハロウィン企画");
    expect(Array.from(body)).toHaveLength(100);
    expect(body.endsWith("🎃…")).toBe(true);
    // 片割れのサロゲートが残っていない
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(body)).toBe(false);
  });

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

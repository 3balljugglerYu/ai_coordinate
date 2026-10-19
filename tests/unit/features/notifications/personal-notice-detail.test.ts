/** @jest-environment node */

jest.mock("@/features/posts/lib/utils", () => ({
  getPostDisplayUrl: jest.fn(() => "https://cdn.example/display.webp"),
}));

import {
  formatPersonalNoticeDate,
  getPersonalNoticeDetailForUser,
} from "@/features/notifications/lib/personal-notice-detail";

const NOTICE_ID = "11111111-2222-4333-8444-555555555555";
const POST_ID = "66666666-7777-4888-8999-000000000000";

type Result = { data: unknown; error: unknown };

/** from(table) ごとに、かけた条件と返す結果を記録する小さな偽物 */
function createSupabase(results: Record<string, Result>) {
  const filters: Record<string, Array<[string, string, unknown]>> = {};
  const client = {
    from(table: string) {
      filters[table] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[table].push(["eq", column, value]);
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters[table].push(["is", column, value]);
          return builder;
        },
        maybeSingle: async () => results[table] ?? { data: null, error: null },
      };
      return builder;
    },
  };
  return { client: client as never, filters };
}

const visiblePost = {
  id: POST_ID,
  user_id: "user-1",
  is_posted: true,
  moderation_status: "visible",
  image_url: null,
  storage_path: "a.png",
  storage_path_display: "a.webp",
};

const recipientRow = (overrides: Record<string, unknown> = {}) => ({
  receipt_code: "HBS-7F3K",
  opened_at: null,
  created_at: "2026-11-07T11:00:00.000Z",
  post: null,
  notice: {
    title: "🎃当選のお知らせ",
    body_template: "受付番号: {受付番号}\n控え: {受付番号}",
  },
  ...overrides,
});

const params = { notificationId: NOTICE_ID, userId: "user-1", locale: "ja" };

describe("getPersonalNoticeDetailForUser", () => {
  test("UUIDでないIDはDBを読まずにnull", async () => {
    const { client, filters } = createSupabase({});

    const result = await getPersonalNoticeDetailForUser(client, {
      ...params,
      notificationId: "abc",
    });

    expect(result).toBeNull();
    expect(filters).toEqual({});
  });

  test("通知の行は読まず_運営だけが書ける記録の表から本人の取り消していない行を読む", async () => {
    const { client, filters } = createSupabase({
      personal_notice_recipients: { data: null, error: null },
    });

    const result = await getPersonalNoticeDetailForUser(client, params);

    expect(result).toBeNull();
    // 利用者は自分の通知の行を書き換えられるので、notifications は読まない
    expect(filters.notifications).toBeUndefined();
    expect(filters.personal_notice_recipients).toEqual([
      ["eq", "notification_id", NOTICE_ID],
      ["eq", "recipient_id", "user-1"],
      ["is", "retracted_at", null],
    ]);
  });

  test("題名と本文は記録から作り_受付番号は全部の印を本人の番号に置き換える", async () => {
    const { client } = createSupabase({
      personal_notice_recipients: { data: recipientRow(), error: null },
    });

    const result = await getPersonalNoticeDetailForUser(client, params);

    expect(result).toEqual({
      id: NOTICE_ID,
      title: "🎃当選のお知らせ",
      body: "受付番号: HBS-7F3K\n控え: HBS-7F3K",
      receivedAtLabel: "2026年11月7日",
      post: null,
      alreadyOpened: false,
    });
  });

  test("番号を使わない回は本文をそのまま出す", async () => {
    const { client } = createSupabase({
      personal_notice_recipients: {
        data: recipientRow({
          receipt_code: null,
          notice: { title: "t", body_template: "200ペルコインを付与しました" },
        }),
        error: null,
      },
    });

    const result = await getPersonalNoticeDetailForUser(client, params);

    expect(result?.body).toBe("200ペルコインを付与しました");
  });

  test("作品つきは1回の問い合わせで読み_本人の公開中の投稿なら表示用の画像を付ける", async () => {
    const { client, filters } = createSupabase({
      personal_notice_recipients: {
        data: recipientRow({ post: visiblePost }),
        error: null,
      },
    });

    const result = await getPersonalNoticeDetailForUser(client, params);

    expect(result?.post).toEqual({
      id: POST_ID,
      imageUrl: "https://cdn.example/display.webp",
    });
    expect(Object.keys(filters)).toEqual(["personal_notice_recipients"]);
  });

  test.each([
    ["非公開にした", { is_posted: false }],
    ["公開停止になった", { moderation_status: "removed" }],
    ["持ち主が違う", { user_id: "someone-else" }],
  ])("送ったあとに%s作品は出さないが_お知らせは読める", async (_label, change) => {
    const { client } = createSupabase({
      personal_notice_recipients: {
        data: recipientRow({ post: { ...visiblePost, ...change } }),
        error: null,
      },
    });

    const result = await getPersonalNoticeDetailForUser(client, params);

    expect(result?.title).toBe("🎃当選のお知らせ");
    expect(result?.post).toBeNull();
  });

  test("前に開いたことがあれば alreadyOpened", async () => {
    const { client } = createSupabase({
      personal_notice_recipients: {
        data: recipientRow({ opened_at: "2026-11-07T12:00:00.000Z" }),
        error: null,
      },
    });

    const result = await getPersonalNoticeDetailForUser(client, params);

    expect(result?.alreadyOpened).toBe(true);
  });

  test("読み込みエラーは投げる(error.tsx に任せる)", async () => {
    const { client } = createSupabase({
      personal_notice_recipients: { data: null, error: new Error("db down") },
    });

    await expect(getPersonalNoticeDetailForUser(client, params)).rejects.toThrow(
      "db down"
    );
  });
});

describe("formatPersonalNoticeDate", () => {
  test("日付は日本時間で出す(UTCでは前日の時刻でも日本の日付になる)", () => {
    expect(formatPersonalNoticeDate("2026-11-06T15:30:00.000Z", "ja")).toBe(
      "2026年11月7日"
    );
  });
});

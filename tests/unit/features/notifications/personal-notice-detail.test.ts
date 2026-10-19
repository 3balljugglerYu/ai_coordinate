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

/** from(table) ごとに、かけた eq と返す結果を記録する小さな偽物 */
function createSupabase(results: Record<string, Result>) {
  const filters: Record<string, Array<[string, unknown]>> = {};
  const client = {
    from(table: string) {
      filters[table] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[table].push([column, value]);
          return builder;
        },
        maybeSingle: async () => results[table] ?? { data: null, error: null },
      };
      return builder;
    },
  };
  return { client: client as never, filters };
}

const notificationRow = (data: Record<string, unknown> = {}) => ({
  id: NOTICE_ID,
  title: "🎃当選のお知らせ",
  body: "受付番号: HBS-7F3K",
  data,
  created_at: "2026-11-07T11:00:00.000Z",
});

describe("getPersonalNoticeDetailForUser", () => {
  test("UUIDでないIDはDBを読まずにnull", async () => {
    const { client, filters } = createSupabase({});

    const result = await getPersonalNoticeDetailForUser(client, {
      notificationId: "abc",
      userId: "user-1",
      locale: "ja",
    });

    expect(result).toBeNull();
    expect(filters).toEqual({});
  });

  test("本人のadmin_messageだけを読む(行が無ければnull=404)", async () => {
    const { client, filters } = createSupabase({
      notifications: { data: null, error: null },
    });

    const result = await getPersonalNoticeDetailForUser(client, {
      notificationId: NOTICE_ID,
      userId: "user-1",
      locale: "ja",
    });

    expect(result).toBeNull();
    expect(filters.notifications).toEqual([
      ["id", NOTICE_ID],
      ["recipient_id", "user-1"],
      ["type", "admin_message"],
    ]);
  });

  test("作品なしは題名・本文・日付だけでpostはnull", async () => {
    const { client, filters } = createSupabase({
      notifications: { data: notificationRow(), error: null },
    });

    const result = await getPersonalNoticeDetailForUser(client, {
      notificationId: NOTICE_ID,
      userId: "user-1",
      locale: "ja",
    });

    expect(result).toEqual({
      id: NOTICE_ID,
      title: "🎃当選のお知らせ",
      body: "受付番号: HBS-7F3K",
      receivedAtLabel: "2026年11月7日",
      post: null,
    });
    expect(filters.generated_images).toBeUndefined();
  });

  test("作品つきは本人の公開中の投稿だけを読み_表示用の画像を付ける", async () => {
    const { client, filters } = createSupabase({
      notifications: {
        data: notificationRow({ post_id: POST_ID }),
        error: null,
      },
      generated_images: {
        data: { id: POST_ID, image_url: null, storage_path: "a.png", storage_path_display: "a.webp" },
        error: null,
      },
    });

    const result = await getPersonalNoticeDetailForUser(client, {
      notificationId: NOTICE_ID,
      userId: "user-1",
      locale: "ja",
    });

    expect(result?.post).toEqual({
      id: POST_ID,
      imageUrl: "https://cdn.example/display.webp",
    });
    expect(filters.generated_images).toEqual([
      ["id", POST_ID],
      ["user_id", "user-1"],
      ["is_posted", true],
      ["moderation_status", "visible"],
    ]);
  });

  test("送ったあとに非公開になった作品は出さないが_お知らせは読める", async () => {
    const { client } = createSupabase({
      notifications: {
        data: notificationRow({ post_id: POST_ID }),
        error: null,
      },
      generated_images: { data: null, error: null },
    });

    const result = await getPersonalNoticeDetailForUser(client, {
      notificationId: NOTICE_ID,
      userId: "user-1",
      locale: "ja",
    });

    expect(result?.title).toBe("🎃当選のお知らせ");
    expect(result?.post).toBeNull();
  });

  test("通知の読み込みエラーは投げる(error.tsx に任せる)", async () => {
    const { client } = createSupabase({
      notifications: { data: null, error: new Error("db down") },
    });

    await expect(
      getPersonalNoticeDetailForUser(client, {
        notificationId: NOTICE_ID,
        userId: "user-1",
        locale: "ja",
      })
    ).rejects.toThrow("db down");
  });
});

describe("formatPersonalNoticeDate", () => {
  test("日付は日本時間で出す(UTCでは前日の時刻でも日本の日付になる)", () => {
    expect(formatPersonalNoticeDate("2026-11-06T15:30:00.000Z", "ja")).toBe(
      "2026年11月7日"
    );
  });
});

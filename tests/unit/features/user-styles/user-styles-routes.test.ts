/** @jest-environment node */

/**
 * /api/user-styles 系 3 route の入口の検証。
 *
 * ここで見るのは**中身ではなく境界**:
 *   1. 段階公開のゲートが**サーバー側で**効くか（UI を隠すだけでは足りない）
 *   2. 閲覧者がクエリではなく `getUser()` から解決されているか
 *   3. 壊れた入力で黙って別のものを返さないか
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isUserStylesAvailable: jest.fn(),
}));
jest.mock("@/features/user-styles/lib/get-user-style-page", () => ({
  ...jest.requireActual("@/features/user-styles/lib/get-user-style-page"),
  getUserStylePage: jest.fn(),
}));
jest.mock("@/features/user-styles/lib/get-followed-authors", () => ({
  ...jest.requireActual("@/features/user-styles/lib/get-followed-authors"),
  getUserStyleFollowedAuthors: jest.fn(),
}));
jest.mock("@/features/style/lib/style-usage-events", () => ({
  recordStyleUsageEvent: jest.fn(),
}));
jest.mock("@/features/style/lib/style-usage-viewer-key", () => ({
  resolveStyleUsageViewerKey: jest.fn(() => "g:server-resolved"),
}));

import { NextRequest } from "next/server";
import { GET as getList } from "@/app/api/user-styles/route";
import { GET as getAuthors } from "@/app/api/user-styles/authors/route";
import { POST as postEvent } from "@/app/api/user-styles/events/route";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable } from "@/lib/env";
import { getUserStylePage } from "@/features/user-styles/lib/get-user-style-page";
import { getUserStyleFollowedAuthors } from "@/features/user-styles/lib/get-followed-authors";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAvailable = isUserStylesAvailable as jest.MockedFunction<
  typeof isUserStylesAvailable
>;
const mockGetPage = getUserStylePage as jest.MockedFunction<
  typeof getUserStylePage
>;
const mockGetAuthors = getUserStyleFollowedAuthors as jest.MockedFunction<
  typeof getUserStyleFollowedAuthors
>;
const mockRecord = recordStyleUsageEvent as jest.MockedFunction<
  typeof recordStyleUsageEvent
>;

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function listRequest(query = ""): NextRequest {
  return new NextRequest(`https://example.test/api/user-styles${query}`);
}

function eventRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/user-styles/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
  mockGetUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getUser>>);
  mockGetPage.mockResolvedValue({ posts: [], nextCursor: null });
  mockGetAuthors.mockResolvedValue([]);
  mockRecord.mockResolvedValue(undefined);
});

/*
  ⭐ UI を閉じるだけでは足りない。route を直接叩けば公開前の一覧が読めてしまう
  （`persta-free-plan-model-lock-ui-only` の教訓）。
  さらに **404 は本文を持たない** ── 失敗の仕方から機能の存在を推測させない。
*/
describe("段階公開のゲート", () => {
  test.each([
    ["一覧", async () => getList(listRequest())],
    ["作者チップ", async () => getAuthors(listRequest("/authors"))],
    [
      "計測",
      async () => postEvent(eventRequest({ eventType: "user_styles_visit" })),
    ],
  ])("%s: フラグ無効なら 404 で本文なし", async (_label, call) => {
    mockAvailable.mockReturnValue(false);

    const res = await call();

    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toBe("");
  });

  test("ゲートには getUser() の結果を渡す（運営プレビュー判定のため）", async () => {
    mockGetUser.mockResolvedValue({ id: "admin-1" } as unknown as Awaited<
      ReturnType<typeof getUser>
    >);

    await getList(listRequest());

    expect(mockAvailable).toHaveBeenCalledWith("admin-1");
  });
});

describe("GET /api/user-styles", () => {
  /*
    ⭐ 閲覧者はブロック・通報の除外基準になる。クエリから受け取れると、
    他人になりすまして除外を外したり、他人の通報状況を推測したりできる。
  */
  test("閲覧者はクエリではなく getUser() から解決する", async () => {
    mockGetUser.mockResolvedValue({ id: "real-viewer" } as unknown as Awaited<
      ReturnType<typeof getUser>
    >);

    await getList(listRequest("?currentUserId=spoofed&viewerId=spoofed"));

    expect(mockGetPage).toHaveBeenCalledWith(
      expect.objectContaining({ currentUserId: "real-viewer" })
    );
  });

  test.each([
    ["0", "小さすぎる"],
    ["41", "上限超え"],
    ["abc", "数値でない"],
  ])("limit=%s は 400（%s）", async (limit) => {
    const res = await getList(listRequest(`?limit=${limit}`));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      errorCode: "USER_STYLES_INVALID_LIMIT",
    });
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  /*
    ⭐ cursor が片方だけのときに黙って先頭から返してはいけない。
    「2ページ目を読んだのに1ページ目と同じ」になり、無限スクロールが止まる。
  */
  test("cursor は片方だけだと 400", async () => {
    const res = await getList(listRequest(`?cursorPostedAt=2026-09-18T00:00:00Z`));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      errorCode: "USER_STYLES_INVALID_CURSOR",
    });
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test("cursorId が UUID でなければ 400", async () => {
    const res = await getList(
      listRequest(`?cursorPostedAt=2026-09-18T00:00:00Z&cursorId=not-a-uuid`)
    );

    expect(res.status).toBe(400);
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  /*
    ⭐ usage は1ページで返し切る設計。cursor を通すと RPC 側が例外を投げ、
    400 で返すべきものが 500 になる。
  */
  test("usage 並びに cursor を付けると 400", async () => {
    const res = await getList(
      listRequest(`?sort=usage&cursorPostedAt=2026-09-18T00:00:00Z&cursorId=${UUID_A}`)
    );

    expect(res.status).toBe(400);
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test("author が UUID でなければ 400（RPC で 22P02 にしない）", async () => {
    const res = await getList(listRequest("?author=not-a-uuid"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      errorCode: "USER_STYLES_INVALID_AUTHOR",
    });
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test("未知の sort は既定(newest)へ倒す（エラーにしない）", async () => {
    await getList(listRequest("?sort=carousel"));

    expect(mockGetPage).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "newest" })
    );
  });

  test("正しい cursor は postedAt と id に分解して渡す", async () => {
    await getList(
      listRequest(`?cursorPostedAt=2026-09-18T00:00:00Z&cursorId=${UUID_B}`)
    );

    expect(mockGetPage).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { postedAt: "2026-09-18T00:00:00Z", id: UUID_B },
      })
    );
  });

  test("取得結果をそのまま返す", async () => {
    mockGetPage.mockResolvedValue({
      posts: [{ id: "p1" }] as never,
      nextCursor: { postedAt: "2026-09-17T00:00:00Z", id: UUID_A },
    });

    const res = await getList(listRequest());

    await expect(res.json()).resolves.toEqual({
      posts: [{ id: "p1" }],
      nextCursor: { postedAt: "2026-09-17T00:00:00Z", id: UUID_A },
    });
  });
});

describe("GET /api/user-styles/authors", () => {
  test("未ログインは 401 ではなく空配列（チップが無いだけでページは成立する）", async () => {
    const res = await getAuthors(listRequest("/authors"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ authors: [] });
  });

  test("閲覧者は getUser() から渡す", async () => {
    mockGetUser.mockResolvedValue({ id: "viewer-9" } as unknown as Awaited<
      ReturnType<typeof getUser>
    >);

    await getAuthors(listRequest("/authors"));

    expect(mockGetAuthors).toHaveBeenCalledWith("viewer-9");
  });
});

describe("POST /api/user-styles/events", () => {
  /*
    ⭐ この入口は /user-styles の2値だけを通す。/style/events の許可集合を
    広げる代わりに専用 route を立てているので、ここが緩むと意味が無くなる。
  */
  test.each([
    ["visit", "既存の /style の訪問数に混ざる"],
    ["generate", "生成数に混ざる"],
    ["mount_shared", "シェア数に混ざる"],
    ["", "空"],
  ])("eventType=%s は 400（%s）", async (eventType) => {
    const res = await postEvent(eventRequest({ eventType }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      errorCode: "USER_STYLES_INVALID_EVENT",
    });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test.each(["user_styles_visit", "user_styles_chip"])(
    "eventType=%s は記録される",
    async (eventType) => {
      const res = await postEvent(eventRequest({ eventType, chip: "all" }));

      expect(res.status).toBe(200);
      expect(mockRecord).toHaveBeenCalledWith(
        expect.objectContaining({ eventType })
      );
    }
  );

  /*
    ⭐ チップ識別子は既知の3つに限る。自由入力を通すと値が散らばって数えられない。
  */
  test("未知のチップ識別子は捨てる（記録自体は通す）", async () => {
    await postEvent(
      eventRequest({ eventType: "user_styles_chip", chip: "../../etc" })
    );

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ categoryKey: null })
    );
  });

  /*
    ⭐ visit にチップを付けると、訪問数とチップ選択数が同じキーで混ざる。
  */
  test("visit には chip を付けない", async () => {
    await postEvent(
      eventRequest({ eventType: "user_styles_visit", chip: "usage" })
    );

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ categoryKey: null })
    );
  });

  test("chip は user_styles_chip のときだけ渡る", async () => {
    await postEvent(
      eventRequest({ eventType: "user_styles_chip", chip: "author" })
    );

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ categoryKey: "author" })
    );
  });

  /*
    ⭐ viewer_key は body から受け取ると、ゲストUUを好きなだけ膨らませられる。
  */
  test("viewerKey はサーバー解決の値を使う（body を信用しない）", async () => {
    await postEvent(
      eventRequest({ eventType: "user_styles_visit", viewerKey: "g:spoofed" })
    );

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ viewerKey: "g:server-resolved" })
    );
  });

  test("この画面はプリセットに紐づかないので styleId は常に null", async () => {
    await postEvent(
      eventRequest({ eventType: "user_styles_visit", styleId: "abc" })
    );

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: null })
    );
  });
});

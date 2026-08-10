/** @jest-environment node */

/**
 * POST /api/posts/home-view-events のテスト（ADR-003）。
 *
 * ここが誤ると KPI テーブルが汚れて既定切り替えの判断を誤る。
 * viewer_key はサーバー側でのみ解決し、post_id は公開中の投稿だけ通す。
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  isFullAdmin: jest.fn(() => false),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/popup-banners/lib/popup-banner-client-ip", () => ({
  getPopupBannerClientIpHash: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/home-view-events/route";
import { getUser } from "@/lib/auth";
import { isFullAdmin } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockIsFullAdmin = isFullAdmin as jest.MockedFunction<typeof isFullAdmin>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockIpHash = getPopupBannerClientIpHash as jest.MockedFunction<
  typeof getPopupBannerClientIpHash
>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "22222222-2222-4222-8222-222222222222";

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/posts/home-view-events", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** insert 内容と、post 可視性チェックの結果を差し込むスタブ。 */
function mockSupabase(options: { postVisible?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const insert = jest.fn((row: Record<string, unknown>) => {
    inserted.push(row);
    return Promise.resolve({ error: null });
  });
  mockCreateAdminClient.mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === "generated_images") {
        const builder = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(() =>
            Promise.resolve({
              data: options.postVisible === false ? null : { id: POST_ID },
              error: null,
            })
          ),
        };
        return builder;
      }
      return { insert };
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
  return inserted;
}

describe("POST /api/posts/home-view-events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFullAdmin.mockReturnValue(false);
  });

  test("ログイン中は viewer_key を u:<user_id> で解決する", async () => {
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    const inserted = mockSupabase();

    const response = await POST(
      buildRequest({ event_type: "home_viewed", view_mode: "feed" })
    );

    expect(response.status).toBe(204);
    expect(inserted[0]).toEqual({
      user_id: USER_ID,
      viewer_key: `u:${USER_ID}`,
      event_type: "home_viewed",
      view_mode: "feed",
      from_view_mode: null,
      post_id: null,
    });
  });

  test("ゲストは g:<ip_hash> で解決し user_id は null", async () => {
    mockGetUser.mockResolvedValue(null);
    mockIpHash.mockReturnValue("hash-abc");
    const inserted = mockSupabase();

    await POST(buildRequest({ event_type: "home_viewed", view_mode: "grid" }));

    expect(inserted[0]).toMatchObject({ user_id: null, viewer_key: "g:hash-abc" });
  });

  test("IP が取れないゲストは記録しない(同一人物の判定ができないため)", async () => {
    mockGetUser.mockResolvedValue(null);
    mockIpHash.mockReturnValue(null);
    const inserted = mockSupabase();

    const response = await POST(
      buildRequest({ event_type: "home_viewed", view_mode: "grid" })
    );

    expect(response.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });

  test("運営の閲覧は KPI に混ぜない", async () => {
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    mockIsFullAdmin.mockReturnValue(true);
    const inserted = mockSupabase();

    await POST(buildRequest({ event_type: "home_viewed", view_mode: "feed" }));

    expect(inserted).toHaveLength(0);
  });

  test("クローラは数えない", async () => {
    const inserted = mockSupabase();

    await POST(
      buildRequest(
        { event_type: "home_viewed", view_mode: "feed" },
        { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }
      )
    );

    expect(inserted).toHaveLength(0);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("公開中でない post_id は記録しない(集計が狂うため)", async () => {
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    const inserted = mockSupabase({ postVisible: false });

    const response = await POST(
      buildRequest({
        event_type: "prompt_use_tapped",
        view_mode: "feed",
        post_id: POST_ID,
      })
    );

    expect(response.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });

  test("公開中の post_id は記録する", async () => {
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    const inserted = mockSupabase({ postVisible: true });

    await POST(
      buildRequest({
        event_type: "prompt_use_tapped",
        view_mode: "grid",
        post_id: POST_ID,
      })
    );

    expect(inserted[0]).toMatchObject({
      event_type: "prompt_use_tapped",
      view_mode: "grid",
      post_id: POST_ID,
    });
  });

  test("view_mode_changed は from_view_mode を保存する", async () => {
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    const inserted = mockSupabase();

    await POST(
      buildRequest({
        event_type: "view_mode_changed",
        view_mode: "feed",
        from_view_mode: "grid",
      })
    );

    expect(inserted[0]).toMatchObject({ from_view_mode: "grid", view_mode: "feed" });
  });

  test.each([
    ["未知の event_type", { event_type: "clicked", view_mode: "feed" }],
    ["未知の view_mode", { event_type: "home_viewed", view_mode: "carousel" }],
    ["view_mode 欠落", { event_type: "home_viewed" }],
    [
      "view_mode_changed に from が無い",
      { event_type: "view_mode_changed", view_mode: "feed" },
    ],
    [
      "post_id が UUID でない",
      { event_type: "prompt_use_tapped", view_mode: "feed", post_id: "nope" },
    ],
  ])("不正な body は 400 (%s)", async (_label, body) => {
    mockSupabase();

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(400);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("insert に失敗しても 204(計測が操作を妨げない)", async () => {
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn(() => ({
        insert: jest.fn(() => Promise.resolve({ error: { message: "boom" } })),
      })),
    } as unknown as ReturnType<typeof createAdminClient>);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      buildRequest({ event_type: "home_viewed", view_mode: "feed" })
    );

    expect(response.status).toBe(204);
    errorSpy.mockRestore();
  });
});

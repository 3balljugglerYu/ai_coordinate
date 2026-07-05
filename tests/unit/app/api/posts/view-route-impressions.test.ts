/** @jest-environment node */

/**
 * POST /api/posts/[id]/view の詳細到達インプレッション計上(v1.1拡張)の回帰テスト。
 *
 * - フラグON+非admin: view_count加算に加えて record_post_impressions を呼ぶ
 *   (viewer_keyはサーバ解決: 認証 u:<id> / ゲスト g:<ip_hash>)
 * - フラグOFF/クローラ/IP不明ゲスト: インプレッションは記録しないが view_count は従来どおり
 * - admin: 従来どおり何もカウントしない
 * - RPC失敗: view応答(200 counted:true)に影響させない
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  isFullAdmin: jest.fn(() => false),
  isPostImpressionsEnabled: jest.fn(() => true),
}));

jest.mock("@/lib/utils", () => ({
  ...jest.requireActual("@/lib/utils"),
  isCrawler: jest.fn(() => false),
}));

jest.mock("@/features/posts/lib/server-api", () => ({
  getPost: jest.fn(),
  incrementViewCount: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/popup-banners/lib/popup-banner-client-ip", () => ({
  getPopupBannerClientIpHash: jest.fn(),
}));

jest.mock("@/lib/api/route-locale", () => ({
  getRouteLocale: jest.fn(() => "ja"),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/[id]/view/route";
import { getUser } from "@/lib/auth";
import { isFullAdmin, isPostImpressionsEnabled } from "@/lib/env";
import { isCrawler } from "@/lib/utils";
import { getPost, incrementViewCount } from "@/features/posts/lib/server-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockIsFullAdmin = isFullAdmin as jest.MockedFunction<typeof isFullAdmin>;
const mockFlag = isPostImpressionsEnabled as jest.MockedFunction<
  typeof isPostImpressionsEnabled
>;
const mockIsCrawler = isCrawler as jest.MockedFunction<typeof isCrawler>;
const mockGetPost = getPost as jest.MockedFunction<typeof getPost>;
const mockIncrementViewCount = incrementViewCount as jest.MockedFunction<
  typeof incrementViewCount
>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockIpHash = getPopupBannerClientIpHash as jest.MockedFunction<
  typeof getPopupBannerClientIpHash
>;

const POST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/posts/${POST_ID}/view`, {
    method: "POST",
  });
}

function callRoute() {
  return POST(createRequest(), { params: Promise.resolve({ id: POST_ID }) });
}

function mockRpc() {
  const rpc = jest.fn().mockResolvedValue({ data: 1, error: null });
  mockCreateAdminClient.mockReturnValue({ rpc } as unknown as ReturnType<
    typeof createAdminClient
  >);
  return rpc;
}

describe("POST /api/posts/[id]/view のインプレッション計上", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag.mockReturnValue(true);
    mockIsFullAdmin.mockReturnValue(false);
    mockIsCrawler.mockReturnValue(false);
    mockGetUser.mockResolvedValue(null);
    mockGetPost.mockResolvedValue({ id: POST_ID } as Awaited<
      ReturnType<typeof getPost>
    >);
    mockIncrementViewCount.mockResolvedValue(undefined as never);
    mockIpHash.mockReturnValue("hash123");
  });

  test("認証ユーザー: view加算 + u:<id> でインプレッション記録", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getUser>
    >);
    const rpc = mockRpc();
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, counted: true });
    expect(mockIncrementViewCount).toHaveBeenCalledWith(POST_ID);
    expect(rpc).toHaveBeenCalledWith("record_post_impressions", {
      p_image_ids: [POST_ID],
      p_viewer_key: "u:user-1",
    });
  });

  test("ゲスト: g:<ip_hash> でインプレッション記録", async () => {
    const rpc = mockRpc();
    await callRoute();
    expect(rpc).toHaveBeenCalledWith("record_post_impressions", {
      p_image_ids: [POST_ID],
      p_viewer_key: "g:hash123",
    });
  });

  test("フラグOFF: viewは加算するがインプレッションは記録しない", async () => {
    mockFlag.mockReturnValue(false);
    const rpc = mockRpc();
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockIncrementViewCount).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("クローラ: viewは従来どおり加算、インプレッションは記録しない", async () => {
    mockIsCrawler.mockReturnValue(true);
    const rpc = mockRpc();
    await callRoute();
    expect(mockIncrementViewCount).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("IP不明ゲスト: viewは加算、インプレッションは記録しない", async () => {
    mockIpHash.mockReturnValue(null);
    const rpc = mockRpc();
    await callRoute();
    expect(mockIncrementViewCount).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("admin: 従来どおり何もカウントしない(counted:false)", async () => {
    mockGetUser.mockResolvedValue({ id: "admin-1" } as Awaited<
      ReturnType<typeof getUser>
    >);
    mockIsFullAdmin.mockReturnValue(true);
    const rpc = mockRpc();
    const res = await callRoute();
    expect(await res.json()).toEqual({ success: true, counted: false });
    expect(mockIncrementViewCount).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("RPC失敗でも view応答は 200 counted:true のまま", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getUser>
    >);
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    mockCreateAdminClient.mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createAdminClient
    >);
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, counted: true });
  });
});

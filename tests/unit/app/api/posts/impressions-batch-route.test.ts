/** @jest-environment node */

/**
 * POST /api/posts/impressions/batch のガードと viewer_key 解決の回帰テスト。
 * (docs/planning/post-impressions-implementation-plan.md EARS-02/04)
 *
 * - フラグOFF/admin/クローラ/IP不明ゲストは 204 no-op(RPC を呼ばない)
 * - viewer_key はサーバ側で解決: 認証 u:<user_id> / ゲスト g:<ip_hash>
 * - 不正 body / 上限超過は 400
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  isFullAdmin: jest.fn(() => false),
  isPostImpressionsEnabled: jest.fn(() => true),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/popup-banners/lib/popup-banner-client-ip", () => ({
  getPopupBannerClientIpHash: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/impressions/batch/route";
import { getUser } from "@/lib/auth";
import { isFullAdmin, isPostImpressionsEnabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockIsFullAdmin = isFullAdmin as jest.MockedFunction<typeof isFullAdmin>;
const mockFlag = isPostImpressionsEnabled as jest.MockedFunction<
  typeof isPostImpressionsEnabled
>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockIpHash = getPopupBannerClientIpHash as jest.MockedFunction<
  typeof getPopupBannerClientIpHash
>;

const IMAGE_ID = "11111111-1111-4111-8111-111111111111";

function createRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/posts/impressions/batch", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockRpc(returnValue: number) {
  const rpc = jest.fn().mockResolvedValue({ data: returnValue, error: null });
  mockCreateAdminClient.mockReturnValue({ rpc } as unknown as ReturnType<
    typeof createAdminClient
  >);
  return rpc;
}

describe("POST /api/posts/impressions/batch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag.mockReturnValue(true);
    mockIsFullAdmin.mockReturnValue(false);
    mockGetUser.mockResolvedValue(null);
    mockIpHash.mockReturnValue("hash123");
  });

  test("フラグOFFは204 no-op(RPCを呼ばない)", async () => {
    mockFlag.mockReturnValue(false);
    const rpc = mockRpc(0);
    const res = await POST(createRequest({ image_ids: [IMAGE_ID] }));
    expect(res.status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("クローラUAは204 no-op", async () => {
    const rpc = mockRpc(0);
    const res = await POST(
      createRequest({ image_ids: [IMAGE_ID] }, { "user-agent": "Googlebot/2.1" }),
    );
    expect(res.status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("adminは204 no-op", async () => {
    mockGetUser.mockResolvedValue({ id: "admin-user" } as Awaited<
      ReturnType<typeof getUser>
    >);
    mockIsFullAdmin.mockReturnValue(true);
    const rpc = mockRpc(0);
    const res = await POST(createRequest({ image_ids: [IMAGE_ID] }));
    expect(res.status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("認証ユーザーは u:<user_id> でRPCを呼び recorded を返す", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getUser>
    >);
    const rpc = mockRpc(1);
    const res = await POST(createRequest({ image_ids: [IMAGE_ID] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: 1 });
    expect(rpc).toHaveBeenCalledWith("record_post_impressions", {
      p_image_ids: [IMAGE_ID],
      p_viewer_key: "u:user-1",
    });
  });

  test("ゲストは g:<ip_hash> でRPCを呼ぶ", async () => {
    mockIpHash.mockReturnValue("abcdef");
    const rpc = mockRpc(1);
    const res = await POST(createRequest({ image_ids: [IMAGE_ID] }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_post_impressions", {
      p_image_ids: [IMAGE_ID],
      p_viewer_key: "g:abcdef",
    });
  });

  test("IPが取れないゲストは204 no-op(安全側=数えない)", async () => {
    mockIpHash.mockReturnValue(null);
    const rpc = mockRpc(0);
    const res = await POST(createRequest({ image_ids: [IMAGE_ID] }));
    expect(res.status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("uuidでない/空/101件のbodyは400", async () => {
    mockRpc(0);
    const notUuid = await POST(createRequest({ image_ids: ["not-a-uuid"] }));
    expect(notUuid.status).toBe(400);

    const empty = await POST(createRequest({ image_ids: [] }));
    expect(empty.status).toBe(400);

    const tooMany = await POST(
      createRequest({ image_ids: Array.from({ length: 101 }, () => IMAGE_ID) }),
    );
    expect(tooMany.status).toBe(400);

    const broken = await POST(createRequest("{not json"));
    expect(broken.status).toBe(400);
  });

  test("sendBeacon相当(text/plainのContent-Type)でもJSONとしてパースできる", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getUser>
    >);
    const rpc = mockRpc(1);
    const res = await POST(
      createRequest(JSON.stringify({ image_ids: [IMAGE_ID] }), {
        "content-type": "text/plain",
      }),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test("RPCエラー時は500(クライアントは静かに無視する契約=EARS-07)", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getUser>
    >);
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    mockCreateAdminClient.mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createAdminClient
    >);
    const res = await POST(createRequest({ image_ids: [IMAGE_ID] }));
    expect(res.status).toBe(500);
  });
});

/** @jest-environment node */

/**
 * POST /api/users/[userId]/follow のテスト。
 *
 * 焦点は**冪等性**。すでにフォローしている状態で押されるのは異常ではなく、
 * フィードの「フォローして生成する」のようにフォロー状態を取得できていない
 * 画面から押される正常な経路がある。ここで 400 を返すと、呼び出し側は
 * 「押せたのに先へ進めない」になり、フォロー済みの人ほど詰まる。
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { POST } from "@/app/api/users/[userId]/follow/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";

function buildRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/users/${AUTHOR_ID}/follow`, {
    method: "POST",
  });
}

function buildParams(userId = AUTHOR_ID) {
  return { params: Promise.resolve({ userId }) };
}

/**
 * follows テーブルのモック。
 *
 * @param existing すでにフォロー関係があるか
 */
function mockFollows(existing: boolean) {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: existing ? { id: "follow-1" } : null, error: null }),
    insert,
  };
  mockCreateClient.mockResolvedValue({
    from: jest.fn(() => builder),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { insert };
}

describe("POST /api/users/[userId]/follow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
  });

  test("未フォローならフォローが成立し created: true を返す", async () => {
    const { insert } = mockFollows(false);

    const response = await POST(buildRequest(), buildParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      isFollowing: true,
      created: true,
    });
    expect(insert).toHaveBeenCalledWith({
      follower_id: VIEWER_ID,
      followee_id: AUTHOR_ID,
    });
  });

  describe("⭐すでにフォロー済みのとき(冪等)", () => {
    test("400 ではなく成功を返す", async () => {
      mockFollows(true);

      const response = await POST(buildRequest(), buildParams());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        isFollowing: true,
        created: false,
      });
    });

    test("重複 INSERT はしない", async () => {
      const { insert } = mockFollows(true);

      await POST(buildRequest(), buildParams());

      expect(insert).not.toHaveBeenCalled();
    });

    test("状態が変わっていないのでキャッシュも無効化しない", async () => {
      mockFollows(true);

      await POST(buildRequest(), buildParams());

      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });
  });

  test("未ログインは 401(冪等化しても認証は緩めない)", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await POST(buildRequest(), buildParams());

    expect(response.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("自分自身は 400 のまま(冪等化の対象ではない)", async () => {
    mockFollows(false);

    const response = await POST(buildRequest(), buildParams(VIEWER_ID));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "FOLLOW_CANNOT_FOLLOW_SELF",
    });
  });
});

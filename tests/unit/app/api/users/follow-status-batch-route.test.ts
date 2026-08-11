/** @jest-environment node */

/**
 * POST /api/users/follow-status/batch のテスト。
 *
 * ここが誤ると (a) 他人同士のフォロー関係が漏れる、(b) 未ログインでフィードの
 * 描画が止まる、のいずれかが起きる。follower_id は必ずサーバー側のセッションから
 * 取り、body からは受け取らない(偽装不可)。
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/users/follow-status/batch/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_A = "22222222-2222-4222-8222-222222222222";
const AUTHOR_B = "33333333-3333-4333-8333-333333333333";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users/follow-status/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** follows テーブルへのクエリを記録しつつ、指定の行を返すモック。 */
function mockFollowsQuery(rows: { followee_id: string }[]) {
  const calls: { eq?: [string, string]; in?: [string, string[]] } = {};
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((column: string, value: string) => {
      calls.eq = [column, value];
      return builder;
    }),
    in: jest.fn((column: string, values: string[]) => {
      calls.in = [column, values];
      return Promise.resolve({ data: rows, error: null });
    }),
  };
  mockCreateClient.mockResolvedValue({
    from: jest.fn(() => builder),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
}

describe("POST /api/users/follow-status/batch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("未ログインは 200 + 空マップ(フィードの描画を止めない)", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await POST(buildRequest({ user_ids: [AUTHOR_A] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ following: {} });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("フォロー済みは true_未フォローも false として明示的に返す", async () => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
    mockFollowsQuery([{ followee_id: AUTHOR_A }]);

    const response = await POST(buildRequest({ user_ids: [AUTHOR_A, AUTHOR_B] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      following: { [AUTHOR_A]: true, [AUTHOR_B]: false },
    });
  });

  test("follower_id は body ではなくセッションから取る(偽装不可)", async () => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
    const calls = mockFollowsQuery([]);

    await POST(
      buildRequest({ user_ids: [AUTHOR_A], follower_id: AUTHOR_B })
    );

    expect(calls.eq).toEqual(["follower_id", VIEWER_ID]);
    expect(calls.in).toEqual(["followee_id", [AUTHOR_A]]);
  });

  test("自分自身は問い合わせから外す", async () => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
    const calls = mockFollowsQuery([]);

    const response = await POST(buildRequest({ user_ids: [VIEWER_ID, AUTHOR_A] }));

    expect(calls.in).toEqual(["followee_id", [AUTHOR_A]]);
    await expect(response.json()).resolves.toEqual({
      following: { [AUTHOR_A]: false },
    });
  });

  test("自分だけを指定したら問い合わせずに空マップ", async () => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
    mockFollowsQuery([]);

    const response = await POST(buildRequest({ user_ids: [VIEWER_ID] }));

    await expect(response.json()).resolves.toEqual({ following: {} });
  });

  test("重複した user_id は1回だけ問い合わせる", async () => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
    const calls = mockFollowsQuery([]);

    await POST(buildRequest({ user_ids: [AUTHOR_A, AUTHOR_A, AUTHOR_A] }));

    expect(calls.in).toEqual(["followee_id", [AUTHOR_A]]);
  });

  test.each([
    ["空配列", { user_ids: [] }],
    ["UUID でない", { user_ids: ["not-a-uuid"] }],
    ["キー違い", { userIds: [AUTHOR_A] }],
    ["100件超", { user_ids: Array.from({ length: 101 }, () => AUTHOR_A) }],
  ])("不正な body は 400 (%s)", async (_label, body) => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(400);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("DB エラーは 500", async () => {
    mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
    const builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    mockCreateClient.mockResolvedValue({
      from: jest.fn(() => builder),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildRequest({ user_ids: [AUTHOR_A] }));

    expect(response.status).toBe(500);
    errorSpy.mockRestore();
  });
});

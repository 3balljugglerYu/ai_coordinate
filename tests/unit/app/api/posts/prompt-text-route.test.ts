/** @jest-environment node */

/**
 * GET /api/posts/[id]/prompt-text のテスト（PROMPT-SECRECY-001）。
 *
 * ここが誤ると (a) 非公開プロンプトの本文が第三者へ出る、
 * (b) 本人が自分の本文をコピーできない、のどちらかが起きる。
 * 実際に (b) が本番で起きていた（参照カードは本人にコピーボタンを出すのに、
 * この API が非公開を一律で 404 にしていた）。
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/prompt-text/route";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

const POST_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const FOLLOWER_ID = "33333333-3333-4333-8333-333333333333";
const PROMPT = "白いワンピースにして";

interface StubOptions {
  isAvailable?: boolean;
  promptVisibility?: "public" | "private";
  originUserId?: string;
  hasSecret?: boolean;
}

function mockSupabase(options: StubOptions = {}) {
  mockCreateAdminClient.mockReturnValue({
    rpc: jest.fn(() => ({
      select: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: {
              is_available: options.isAvailable ?? true,
              root_post_id: POST_ID,
            },
            error: null,
          }),
      }),
    })),
    from: jest.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === "generated_images"
                  ? {
                      prompt_visibility: options.promptVisibility ?? "private",
                      user_id: options.originUserId ?? OWNER_ID,
                    }
                  : options.hasSecret === false
                    ? null
                    : { prompt: PROMPT },
              error: null,
            }),
        }),
      }),
    })),
  } as unknown as ReturnType<typeof createAdminClient>);
}

const params = Promise.resolve({ id: POST_ID });

function request(): NextRequest {
  return new NextRequest(`http://localhost/api/posts/${POST_ID}/prompt-text`);
}

describe("GET /api/posts/[id]/prompt-text", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("本人は自分の非公開プロンプトを取り出せる", async () => {
    // 非公開は「第三者へ渡さない」設定であって、自分の資産を自分から
    // 遠ざけるものではない。本人は投稿詳細で本文をそのまま読めている
    mockGetUser.mockResolvedValue({ id: OWNER_ID } as never);
    mockSupabase({ promptVisibility: "private", originUserId: OWNER_ID });

    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      postId: POST_ID,
      prompt: PROMPT,
    });
  });

  test("第三者には非公開プロンプトを出さない(秘匿の要)", async () => {
    // validate は通る = フォロワー。それでも非公開は渡さない
    mockGetUser.mockResolvedValue({ id: FOLLOWER_ID } as never);
    mockSupabase({ promptVisibility: "private", originUserId: OWNER_ID });

    const response = await GET(request(), { params });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "POSTS_PROMPT_TEXT_UNAVAILABLE",
    });
  });

  test("公開プロンプトは第三者にも出す(validate を通ったフォロワー)", async () => {
    mockGetUser.mockResolvedValue({ id: FOLLOWER_ID } as never);
    mockSupabase({ promptVisibility: "public", originUserId: OWNER_ID });

    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
  });

  test("本人でも validate が false なら出さない(投稿取消・公開停止など)", async () => {
    mockGetUser.mockResolvedValue({ id: OWNER_ID } as never);
    mockSupabase({
      isAvailable: false,
      promptVisibility: "private",
      originUserId: OWNER_ID,
    });

    const response = await GET(request(), { params });

    expect(response.status).toBe(404);
  });

  test("未ログインは 401", async () => {
    mockGetUser.mockResolvedValue(null);
    mockSupabase();

    const response = await GET(request(), { params });

    expect(response.status).toBe(401);
  });

  test("secret が無ければ出さない(本文の正本が無い)", async () => {
    mockGetUser.mockResolvedValue({ id: OWNER_ID } as never);
    mockSupabase({
      promptVisibility: "private",
      originUserId: OWNER_ID,
      hasSecret: false,
    });

    const response = await GET(request(), { params });

    expect(response.status).toBe(404);
  });

  test("落ちた理由は区別させない(どの条件でも同じ 404)", async () => {
    mockGetUser.mockResolvedValue({ id: FOLLOWER_ID } as never);

    mockSupabase({ promptVisibility: "private", originUserId: OWNER_ID });
    const blockedByVisibility = await GET(request(), { params });

    mockSupabase({ isAvailable: false, originUserId: OWNER_ID });
    const blockedByValidation = await GET(request(), { params });

    expect(blockedByVisibility.status).toBe(blockedByValidation.status);
    await expect(blockedByVisibility.json()).resolves.toEqual(
      await blockedByValidation.json()
    );
  });
});

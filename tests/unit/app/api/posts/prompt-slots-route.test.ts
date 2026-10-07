/** @jest-environment node */

/**
 * GET /api/posts/[id]/prompt-slots(名前の欄の見出しだけを返す。docs/planning/name-input-slot-plan.md 3.5)。
 *
 * ⭐ 本文は返さない。非公開プロンプトでも見出しは返す(本文が届かないので秘匿は崩れない)。
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isNameInputAvailable: jest.fn(() => true),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/prompt-slots/route";
import { getUser } from "@/lib/auth";
import { isNameInputAvailable } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAvailable = isNameInputAvailable as jest.MockedFunction<typeof isNameInputAvailable>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

const POST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const SECRET_BODY = "ひみつの本文。{{INPUT*:うちの子|例：ぺるこ}} を表示";

function mockSupabase({ isAvailable = true, prompt = SECRET_BODY as string | null } = {}) {
  const from = jest.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: prompt === null ? null : { prompt }, error: null }),
      }),
    }),
  }));
  const rpc = jest.fn(() => ({
    select: () => ({
      maybeSingle: () =>
        Promise.resolve({ data: { is_available: isAvailable, root_post_id: POST_ID }, error: null }),
    }),
  }));
  mockCreateAdminClient.mockReturnValue({ rpc, from } as never);
  return { rpc, from };
}

function call() {
  const request = new NextRequest(`http://localhost/api/posts/${POST_ID}/prompt-slots`);
  return GET(request, { params: Promise.resolve({ id: POST_ID }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
  mockGetUser.mockResolvedValue({ id: USER_ID } as never);
});

describe("GET /api/posts/[id]/prompt-slots", () => {
  test("見出し・入力例・必須だけを返し、本文は返さない", async () => {
    mockSupabase();
    const response = await call();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      // 手書きの「例：」は外して返す(画面で付ける)
      nameInput: { label: "うちの子", placeholder: "ぺるこ", required: true },
    });
    expect(text).not.toContain("ひみつの本文");
  });

  test("目印の無いプロンプトは nameInput: null", async () => {
    mockSupabase({ prompt: "ふつうのプロンプト" });
    expect(await (await call()).json()).toEqual({ nameInput: null });
  });

  test("名前の欄を使えない人には、DB を見ずに nameInput: null", async () => {
    mockAvailable.mockReturnValue(false);
    const { rpc } = mockSupabase();
    expect(await (await call()).json()).toEqual({ nameInput: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("未ログインは 401", async () => {
    mockGetUser.mockResolvedValue(null);
    mockSupabase();
    expect((await call()).status).toBe(401);
  });

  test("使えない原作(未フォロー・ブロックなど)は 404(理由は区別しない)", async () => {
    mockSupabase({ isAvailable: false });
    const response = await call();
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("POSTS_PROMPT_SLOTS_UNAVAILABLE");
  });

  test("本文が見つからなければ 404", async () => {
    mockSupabase({ prompt: null });
    expect((await call()).status).toBe(404);
  });
});

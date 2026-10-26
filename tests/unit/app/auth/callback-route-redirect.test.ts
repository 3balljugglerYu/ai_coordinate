/** @jest-environment node */

/**
 * 登録・ログインのあとの処理: ?next= に外のサイトを渡されても、よそへ移さない。
 */

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      exchangeCodeForSession: jest.fn(async () => ({
        data: { user: { id: "u1", created_at: "2020-01-01T00:00:00Z", user_metadata: {} } },
        error: null,
      })),
      updateUser: jest.fn(async () => ({ error: null })),
    },
  })),
}));

import { GET } from "@/app/auth/callback/route";

async function locationFor(next: string) {
  const response = await GET(
    new Request(`https://www.persta.ai/auth/callback?code=abc&next=${encodeURIComponent(next)}`),
  );
  return response.headers.get("location");
}

test("このサイトの中のパスへは、そのまま移る", async () => {
  expect(await locationFor("/ja/style")).toBe("https://www.persta.ai/ja/style");
});

test.each(["@evil.com", "//evil.com", "https://evil.com", "/\\evil.com"])("%s は最初のページへ移す(よそへ移さない)", async (next) => {
  const location = await locationFor(next);
  expect(location).toBe("https://www.persta.ai/");
  expect(new URL(location as string).host).toBe("www.persta.ai");
});

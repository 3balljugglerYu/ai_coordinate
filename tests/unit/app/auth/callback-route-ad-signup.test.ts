/** @jest-environment node */

/**
 * 登録のあとの処理: 新しく登録した人にだけ、広告の Pixel に「登録した」を知らせる印(Cookie)を付ける。
 */

const mockExchange = jest.fn();
const mockUpdateUser = jest.fn(async () => ({ error: null }));
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchange, updateUser: mockUpdateUser },
    from: () => ({ update: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }) }),
  })),
}));

import { GET } from "@/app/auth/callback/route";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

function callback() {
  return GET(new Request("https://www.persta.ai/auth/callback?code=abc&next=/ja/style"));
}

function metaSignupCookie(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(/,(?=\s*\w+=)/).find((c) => c.trim().startsWith("persta_ad_signup_meta="));
}

function signupCookie(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(/,(?=\s*\w+=)/).find((c) => c.trim().startsWith("persta_ad_signup="));
}

beforeEach(() => {
  mockExchange.mockReset();
  mockUpdateUser.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("今登録した人には、10分だけ残る印を付ける(中身は 1 だけ)", async () => {
  mockExchange.mockResolvedValue({
    data: { user: { id: "u1", created_at: minutesAgo(0), email_confirmed_at: minutesAgo(0), user_metadata: {} } },
    error: null,
  });
  const response = await callback();
  expect(response.status).toBe(307);
  const cookie = signupCookie(response);
  expect(cookie).toBeDefined();
  expect(cookie).toContain("persta_ad_signup=1");
  expect(cookie).toMatch(/Max-Age=600/i);
  expect(cookie).toMatch(/Path=\//i);
  expect(cookie).not.toMatch(/HttpOnly/i);
  expect(cookie).not.toContain("u1");
  // Meta 用の印も、同じ決まりで付ける
  expect(metaSignupCookie(response)).toContain("persta_ad_signup_meta=1");
  expect(metaSignupCookie(response)).toMatch(/Max-Age=86400/i);
  // 送った印を残す(2回目は送らない)
  expect(mockUpdateUser).toHaveBeenCalledWith({
    data: expect.objectContaining({ ad_signup_reported_at: expect.any(String) }),
  });
});

test("登録の直後でも、もう送った人(ログインし直し・別の端末)には印を付けない", async () => {
  mockExchange.mockResolvedValue({
    data: {
      user: {
        id: "u3",
        created_at: minutesAgo(2),
        email_confirmed_at: minutesAgo(2),
        user_metadata: { ad_signup_reported_at: minutesAgo(1) },
      },
    },
    error: null,
  });
  const response = await callback();
  expect(signupCookie(response)).toBeUndefined();
  expect(mockUpdateUser).not.toHaveBeenCalled();
});

test("前から使っている人のログインし直しには、印を付けない", async () => {
  mockExchange.mockResolvedValue({
    data: { user: { id: "u2", created_at: minutesAgo(60 * 24 * 30), email_confirmed_at: minutesAgo(60 * 24 * 30), user_metadata: {} } },
    error: null,
  });
  const response = await callback();
  expect(response.status).toBe(307);
  expect(signupCookie(response)).toBeUndefined();
  expect(metaSignupCookie(response)).toBeUndefined();
});

test("ログインに失敗したときは、印を付けない", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockExchange.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });
  const response = await callback();
  expect(signupCookie(response)).toBeUndefined();
});

test("送った印を残せなかったときは、印の Cookie を付けない(次のログインで二重に送らないように)", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockUpdateUser.mockResolvedValueOnce({ error: { message: "rate limited" } } as never);
  mockExchange.mockResolvedValue({
    data: { user: { id: "u4", created_at: minutesAgo(0), email_confirmed_at: minutesAgo(0), user_metadata: {} } },
    error: null,
  });
  const response = await callback();
  expect(response.status).toBe(307);
  expect(signupCookie(response)).toBeUndefined();
  expect(metaSignupCookie(response)).toBeUndefined();
});

test("X でのログイン(p=x)で、完了の画面へ移るときも印を付ける", async () => {
  mockExchange.mockResolvedValue({
    data: { user: { id: "u5", created_at: minutesAgo(0), email_confirmed_at: minutesAgo(0), user_metadata: {} } },
    error: null,
  });
  const response = await GET(new Request("https://www.persta.ai/auth/callback?code=abc&p=x&next=/ja/style"));
  expect(response.headers.get("location")).toContain("/auth/x-complete");
  expect(signupCookie(response)).toContain("persta_ad_signup=1");
});


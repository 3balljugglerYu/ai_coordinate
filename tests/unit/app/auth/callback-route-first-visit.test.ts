/** @jest-environment node */

/**
 * OAuth の登録のあと、最初に来た場所を user_first_visits に書く(管理ダッシュボード P3-3)。
 *
 * ここで守ること:
 *  - 新しく登録した人(24時間以内)だけ書く。前から使っている人のログインでは書かない
 *  - すでに行があれば書き直さない(メールでの登録はトリガーが先に書いている・最初の値を残す)
 *  - cookie が無い・読めないときは書かない
 *  - 書けなくても、ログインはふつうに終わる
 */

const mockExchange = jest.fn();
const mockUpsert = jest.fn(async () => ({ error: null as { message: string } | null }));
const mockAdminFrom = jest.fn(() => ({ upsert: mockUpsert }));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchange, updateUser: jest.fn(async () => ({ error: null })) },
    from: () => ({ update: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }) }),
  })),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({ from: mockAdminFrom })),
}));

import { GET } from "@/app/auth/callback/route";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

function callback(cookie?: string) {
  return GET(
    new Request("https://www.persta.ai/auth/callback?code=abc&next=/ja/style", {
      headers: cookie ? { cookie } : {},
    }),
  );
}

/** runAfterResponse はリクエストの外では、その場で始める。終わるのを待つ */
async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

function signedIn(createdAt: string) {
  mockExchange.mockResolvedValue({
    data: { user: { id: "u1", created_at: createdAt, email_confirmed_at: createdAt, user_metadata: {} } },
    error: null,
  });
}

beforeEach(() => {
  mockExchange.mockReset();
  mockUpsert.mockClear();
  mockAdminFrom.mockClear();
});

test("新しく登録した人は、cookie の来た場所とパスを書く。すでに行があれば書き直さない", async () => {
  signedIn(minutesAgo(1));

  const response = await callback(`persta_first_visit=${encodeURIComponent("search|/ja/style")}`);
  await settle();

  expect(response.status).toBe(307);
  expect(mockAdminFrom).toHaveBeenCalledWith("user_first_visits");
  expect(mockUpsert).toHaveBeenCalledWith(
    { user_id: "u1", channel: "search", landing_path: "/ja/style" },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
});

test("前から使っている人(24時間より前の登録)のログインでは書かない", async () => {
  signedIn(minutesAgo(60 * 25));

  await callback(`persta_first_visit=${encodeURIComponent("direct|/")}`);
  await settle();

  expect(mockUpsert).not.toHaveBeenCalled();
});

test("cookie が無い・来た場所が決まりに無いときは書かない", async () => {
  signedIn(minutesAgo(1));

  await callback();
  await callback(`persta_first_visit=${encodeURIComponent("facebook|/")}`);
  await settle();

  expect(mockUpsert).not.toHaveBeenCalled();
});

test("書けなくても、ログインはふつうに終わる", async () => {
  signedIn(minutesAgo(1));
  mockUpsert.mockResolvedValueOnce({ error: { message: "db down" } });
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await callback(`persta_first_visit=${encodeURIComponent("x|/")}`);
  await settle();

  expect(response.status).toBe(307);
  expect(errors).toHaveBeenCalledWith(
    "Failed to record first visit during auth callback:",
    expect.objectContaining({ message: "db down" }),
  );
  errors.mockRestore();
});

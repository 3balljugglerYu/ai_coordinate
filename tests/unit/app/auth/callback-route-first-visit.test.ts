/** @jest-environment node */

/**
 * OAuth の登録のあと、最初に来た場所を user_first_visits に書く(管理ダッシュボード P3-3)。
 *
 * ここで守ること:
 *  - 新しく登録した人(24時間以内)で、まだ書いていない人(user_metadata に印が無い)だけ書く
 *  - 書けたら user_metadata に印を付け(次のログインでは書かない)、cookie を消す
 *  - 書けなかったら印も付けず、cookie も残す(次のログインでもう一度試す)。ログインはふつうに終わる
 *  - メールでの登録(user_metadata にあり、トリガーが書いた)・前から使っている人では書かない
 *  - すでに行があれば書き直さない(最初の値を残す)
 */

const mockExchange = jest.fn();
const mockUpsert = jest.fn(async () => ({ error: null as { message: string } | null }));
const mockAdminFrom = jest.fn(() => ({ upsert: mockUpsert }));
const mockUpdateUser = jest.fn<Promise<{ error: null }>, [unknown]>(async () => ({ error: null }));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchange, updateUser: mockUpdateUser },
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

function signedIn(createdAt: string, userMetadata: Record<string, string> = {}) {
  mockExchange.mockResolvedValue({
    data: { user: { id: "u1", created_at: createdAt, email_confirmed_at: createdAt, user_metadata: userMetadata } },
    error: null,
  });
}

function firstVisitCookie(response: Response) {
  return (response.headers.get("set-cookie") ?? "")
    .split(/,(?=\s*\w+=)/)
    .find((c) => c.trim().startsWith("persta_first_visit="));
}

beforeEach(() => {
  mockExchange.mockReset();
  mockUpsert.mockClear();
  mockAdminFrom.mockClear();
  mockUpdateUser.mockClear();
});

function metadataSent(): Record<string, string> {
  const call = mockUpdateUser.mock.calls[0]?.[0] as { data: Record<string, string> } | undefined;
  return call?.data ?? {};
}

test("新しく登録した人は、cookie の来た場所とパスを書き、書けたら印を付けて cookie を消す", async () => {
  signedIn(minutesAgo(1));

  const response = await callback(`persta_first_visit=${encodeURIComponent("search|/style")}`);

  expect(response.status).toBe(307);
  expect(mockAdminFrom).toHaveBeenCalledWith("user_first_visits");
  expect(mockUpsert).toHaveBeenCalledWith(
    { user_id: "u1", channel: "search", landing_path: "/style" },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  expect(metadataSent().first_visit_channel).toBe("search");
  expect(firstVisitCookie(response)).toMatch(/Max-Age=0/i);
});

test("書けなかったら、印は付けず cookie も残す(ログインはふつうに終わる)", async () => {
  signedIn(minutesAgo(1));
  mockUpsert.mockResolvedValueOnce({ error: { message: "db down" } });
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await callback(`persta_first_visit=${encodeURIComponent("x|/")}`);

  expect(response.status).toBe(307);
  expect(metadataSent().first_visit_channel).toBeUndefined();
  expect(firstVisitCookie(response)).toBeUndefined();
  expect(errors).toHaveBeenCalledWith(
    "Failed to record first visit during auth callback:",
    expect.objectContaining({ message: "db down" }),
  );
  errors.mockRestore();
});

test("すでに書いた人(印がある・メールでの登録を含む)では書かない", async () => {
  signedIn(minutesAgo(1), { first_visit_channel: "search" });

  const response = await callback(`persta_first_visit=${encodeURIComponent("direct|/")}`);

  expect(mockUpsert).not.toHaveBeenCalled();
  expect(firstVisitCookie(response)).toBeUndefined();
});

test("前から使っている人(24時間より前の登録)のログインでは書かない", async () => {
  signedIn(minutesAgo(60 * 25));

  await callback(`persta_first_visit=${encodeURIComponent("direct|/")}`);

  expect(mockUpsert).not.toHaveBeenCalled();
});

test("cookie が無い・来た場所が決まりに無いときは書かない", async () => {
  signedIn(minutesAgo(1));

  await callback();
  await callback(`persta_first_visit=${encodeURIComponent("facebook|/")}`);

  expect(mockUpsert).not.toHaveBeenCalled();
});

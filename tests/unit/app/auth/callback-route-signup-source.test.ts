/** @jest-environment node */

/**
 * OAuth の登録のあと、登録した経路(signup_source)を残す。
 *
 * ここで守ること:
 *  - 登録した経路は、だれでも読める profiles には書かない。運営(service_role)だけが読む
 *    user_signup_sources に、RPC record_signup_source で書く(すでにあれば RPC が書き直さない)
 *  - 新しく登録した人(24時間以内)だけ書く。前から使っている人のログインでは書かない
 *  - 書けなかったらログに残し、ログインはふつうに終わる
 */

const mockExchange = jest.fn();
const mockUserFrom = jest.fn();
const mockAdminRpc = jest.fn(async () => ({ data: true, error: null as { message: string } | null }));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchange, updateUser: jest.fn(async () => ({ error: null })) },
    from: mockUserFrom,
  })),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({ rpc: mockAdminRpc, from: jest.fn() })),
}));

import { GET } from "@/app/auth/callback/route";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

function signedIn(createdAt: string) {
  mockExchange.mockResolvedValue({
    data: { user: { id: "u1", created_at: createdAt, email_confirmed_at: createdAt, user_metadata: {} } },
    error: null,
  });
}

function callback(query: string) {
  return GET(new Request(`https://www.persta.ai/auth/callback?code=abc&next=/ja/style&${query}`));
}

beforeEach(() => {
  mockExchange.mockReset();
  mockUserFrom.mockReset();
  mockAdminRpc.mockClear();
});

test("新しく登録した人の経路は、運営だけが読む表に RPC で書き、profiles には書かない", async () => {
  signedIn(minutesAgo(1));

  const response = await callback("signup_source=halloween-best-shot");

  expect(response.status).toBe(307);
  expect(mockAdminRpc).toHaveBeenCalledWith("record_signup_source", {
    p_user_id: "u1",
    p_signup_source: "halloween-best-shot",
  });
  expect(mockUserFrom).not.toHaveBeenCalledWith("profiles");
});

test("前から使っている人(24時間より前の登録)のログインでは書かない", async () => {
  signedIn(minutesAgo(60 * 25));

  await callback("signup_source=halloween-best-shot");

  expect(mockAdminRpc).not.toHaveBeenCalledWith("record_signup_source", expect.anything());
});

test("書けなかったらログに残し、ログインはふつうに終わる", async () => {
  signedIn(minutesAgo(1));
  mockAdminRpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});

  try {
    const response = await callback("signup_source=wardrobe");

    expect(response.status).toBe(307);
    expect(errors).toHaveBeenCalledWith(
      "Failed to record signup_source during auth callback:",
      expect.objectContaining({ message: "db down" }),
    );
  } finally {
    errors.mockRestore();
  }
});

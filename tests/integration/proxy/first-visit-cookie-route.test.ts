/** @jest-environment node */

/**
 * proxy を通したとき、はじめて来た人に「最初に来た場所」の cookie を付ける(管理ダッシュボード P3-3)。
 *
 * ここで守ること:
 *  - ロケール付きの URL へのリダイレクトでも付け、パスは言語の部分を外したもの
 *  - ふつうの画面の応答でも付ける
 *  - すでにあれば付け直さない
 *  - URL の first_visit(引き継ぎ)は、消したアドレスへ移し直して、その値で付ける
 */

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));
jest.mock("@/lib/api-docs-auth", () => ({ enforceApiDocsBasicAuth: jest.fn(() => null) }));
jest.mock("@/lib/i2i-poc-auth", () => ({ enforceI2iPocBasicAuth: jest.fn(() => null) }));

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

function pageRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers: { "sec-fetch-dest": "document", ...headers } });
}

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  (createServerClient as jest.Mock).mockReturnValue({
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: jest.fn(),
  });
});

afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
});

test("ロケール付きの URL へのリダイレクトでも付け、パスは最初に開いた URL のもの", async () => {
  const response = (await proxy(
    pageRequest("http://localhost/style?twclid=abc"),
  )) as NextResponse;

  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  expect(response.cookies.get("persta_first_visit")?.value).toBe("x_ad|/style");
});

test("ふつうの画面の応答でも付ける", async () => {
  const response = (await proxy(
    pageRequest("http://localhost/ja/style", { referer: "https://www.google.com/" }),
  )) as NextResponse;

  expect(response.cookies.get("persta_first_visit")?.value).toBe("search|/style");
});

test("すでにあれば付け直さない", async () => {
  const response = (await proxy(
    pageRequest("http://localhost/ja/style", {
      referer: "https://www.google.com/",
      cookie: "persta_first_visit=meta%7C%2Fja",
    }),
  )) as NextResponse;

  expect(response.cookies.get("persta_first_visit")).toBeUndefined();
});

test("URL の first_visit は、消したアドレスへ移し直して、その値で付ける", async () => {
  const response = (await proxy(
    pageRequest("http://localhost/ja/login?first_visit=meta%7C%2Fcollections%2Fhalloween"),
  )) as NextResponse;

  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).search).toBe("");
  expect(response.cookies.get("persta_first_visit")?.value).toBe("meta|/collections/halloween");
});

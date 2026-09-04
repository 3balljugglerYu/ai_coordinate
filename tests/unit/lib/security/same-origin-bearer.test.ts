/** @jest-environment node */

/**
 * `ensureSameOrigin` の Bearer 経路。
 *
 * ネイティブアプリは Origin を送らないため、従来の「Origin 必須」だと
 * すべての更新系 API が 403 になる。Bearer の JWT があり Origin が無い場合だけ
 * 通し、ブラウザ発(Origin あり)は従来どおり検査することを固定する。
 */

import { NextRequest } from "next/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjQxMDI0NDQ4MDB9.c2ln";

function post(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://persta.ai/api/generate-async", {
    method: "POST",
    headers,
  });
}

describe("ensureSameOrigin with Bearer", () => {
  test("Origin 無し + Bearer JWT は通す(アプリ)", () => {
    expect(ensureSameOrigin(post({ authorization: `Bearer ${JWT}` }))).toBeNull();
  });

  test("Origin 無し + Bearer 無しは従来どおり 403", async () => {
    const response = ensureSameOrigin(post());
    expect(response?.status).toBe(403);
    await expect(response!.json()).resolves.toEqual({
      error: "Missing Origin header",
    });
  });

  test("Origin 無し + 非 JWT の Bearer は従来どおり 403", () => {
    expect(
      ensureSameOrigin(post({ authorization: "Bearer cron-secret" }))?.status
    ).toBe(403);
  });

  test("cross-site Origin は Bearer があっても 403(ブラウザ発は従来どおり)", async () => {
    const response = ensureSameOrigin(
      post({ origin: "https://evil.example", authorization: `Bearer ${JWT}` })
    );
    expect(response?.status).toBe(403);
    await expect(response!.json()).resolves.toEqual({
      error: "Cross-site request rejected",
    });
  });

  test("同一 Origin は従来どおり通す", () => {
    expect(ensureSameOrigin(post({ origin: "https://persta.ai" }))).toBeNull();
  });

  test("GET は検査しない", () => {
    const request = new NextRequest("https://persta.ai/api/posts", {
      method: "GET",
    });
    expect(ensureSameOrigin(request)).toBeNull();
  });
});

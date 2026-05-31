/** @jest-environment node */

import { NextRequest } from "next/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";

function makeRequest(
  method: string,
  options: { origin?: string | null; url?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (options.origin !== null && options.origin !== undefined) {
    headers.set("origin", options.origin);
  }
  return new NextRequest(options.url ?? "https://app.example.com/api/test", {
    method,
    headers,
  });
}

describe("ensureSameOrigin", () => {
  test("GET は素通し (= null を返す)", () => {
    expect(
      ensureSameOrigin(makeRequest("GET", { origin: null })),
    ).toBeNull();
  });

  test("HEAD も素通し", () => {
    expect(
      ensureSameOrigin(makeRequest("HEAD", { origin: null })),
    ).toBeNull();
  });

  test("OPTIONS (preflight) も素通し", () => {
    expect(
      ensureSameOrigin(makeRequest("OPTIONS", { origin: null })),
    ).toBeNull();
  });

  test("mutation で Origin ヘッダーが無い → 403 Missing Origin", async () => {
    const res = ensureSameOrigin(makeRequest("POST", { origin: null }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    expect(await res!.json()).toEqual({ error: "Missing Origin header" });
  });

  test("PATCH でも cross-site Origin は 403", async () => {
    const res = ensureSameOrigin(
      makeRequest("PATCH", {
        origin: "https://evil.example",
        url: "https://app.example.com/api/test",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    expect(await res!.json()).toEqual({ error: "Cross-site request rejected" });
  });

  test("DELETE で cross-site Origin は 403", async () => {
    const res = ensureSameOrigin(
      makeRequest("DELETE", {
        origin: "https://attacker.example",
        url: "https://app.example.com/api/test",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  test("同一オリジンの POST は null を返す (= 通過)", () => {
    const res = ensureSameOrigin(
      makeRequest("POST", {
        origin: "https://app.example.com",
        url: "https://app.example.com/api/test",
      }),
    );
    expect(res).toBeNull();
  });

  test("port を含む同一オリジンも通過する", () => {
    const res = ensureSameOrigin(
      makeRequest("POST", {
        origin: "http://localhost:3000",
        url: "http://localhost:3000/api/test",
      }),
    );
    expect(res).toBeNull();
  });

  test("不正な URL の Origin (= URL parse 失敗) は 403", async () => {
    const res = ensureSameOrigin(
      makeRequest("POST", {
        origin: "not-a-url",
        url: "https://app.example.com/api/test",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    expect(await res!.json()).toEqual({ error: "Invalid Origin header" });
  });

  test("Origin の host が request host と異なる (= port 違い) も 403", async () => {
    const res = ensureSameOrigin(
      makeRequest("POST", {
        origin: "https://app.example.com:8080",
        url: "https://app.example.com/api/test",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});

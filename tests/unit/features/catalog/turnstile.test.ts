/** @jest-environment node */

jest.mock("@/lib/env", () => ({
  env: { TURNSTILE_SECRET_KEY: "test-secret" },
}));

import { verifyTurnstileToken } from "@/features/catalog/lib/turnstile";

describe("verifyTurnstileToken", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  test("token 未指定なら missing_token", async () => {
    const result = await verifyTurnstileToken("");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("missing_token");
  });

  test("成功レスポンスなら success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    }) as unknown as typeof fetch;

    const result = await verifyTurnstileToken("token");
    expect(result.success).toBe(true);
  });

  test("remoteIp を渡すと verify エンドポイントの body に remoteip が含まれる", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await verifyTurnstileToken("token", "203.0.113.42");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = (fetchMock.mock.calls[0][1] as { body: string }).body;
    const params = new URLSearchParams(body);
    expect(params.get("remoteip")).toBe("203.0.113.42");
    expect(params.get("secret")).toBe("test-secret");
    expect(params.get("response")).toBe("token");
  });

  test("失敗レスポンスなら rejected", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    }) as unknown as typeof fetch;

    const result = await verifyTurnstileToken("token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("rejected");
  });

  test("HTTP 非 200 なら rejected", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const result = await verifyTurnstileToken("token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("rejected");
  });

  test("fetch が例外を投げても rejected で握り潰される", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    const result = await verifyTurnstileToken("token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("rejected");
    consoleSpy.mockRestore();
  });
});

describe("verifyTurnstileToken (secret 未設定)", () => {
  let mockEnv: { TURNSTILE_SECRET_KEY: string };
  beforeAll(() => {
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({
      env: { TURNSTILE_SECRET_KEY: "" },
    }));
    mockEnv = jest.requireMock<{ env: { TURNSTILE_SECRET_KEY: string } }>(
      "@/lib/env",
    ).env;
  });
  afterAll(() => {
    jest.dontMock("@/lib/env");
  });

  test("secret 未設定で missing_secret を返す", async () => {
    expect(mockEnv.TURNSTILE_SECRET_KEY).toBe("");
    // 動的 import で mock 後のバインディングを取り直す
    const mod = await import("@/features/catalog/lib/turnstile");
    const result = await mod.verifyTurnstileToken("token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("missing_secret");
  });
});

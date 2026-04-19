describe("Public env helpers", () => {
  const originalEnv = process.env;
  const originalWarn = console.warn;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    console.warn = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.warn = originalWarn;
  });

  test("development で必須 public env が不足している場合は警告する", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    await import("@/lib/public-env");

    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenNthCalledWith(
      1,
      "⚠️ Missing public environment variables:",
      expect.stringContaining("NEXT_PUBLIC_SUPABASE_URL")
    );
    expect(console.warn).toHaveBeenNthCalledWith(
      2,
      "⚠️ Some client-side features may not work without these environment variables."
    );
  });

  test("NEXT_PUBLIC_SITE_URL がある場合は getSiteUrlForClient がそれを返す", async () => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";

    const { getSiteUrlForClient } = await import("@/lib/public-env");

    expect(getSiteUrlForClient()).toBe("https://example.com");
  });

  test("NEXT_PUBLIC_SITE_URL がない場合はブラウザ origin を返す", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const { getSiteUrlForClient } = await import("@/lib/public-env");

    expect(getSiteUrlForClient()).toBe(window.location.origin);
  });

  test("development で NEXT_PUBLIC_SITE_URL がない場合は localhost を返す", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const { getSiteUrlForClient } = await import("@/lib/public-env");

    expect(getSiteUrlForClient()).toBe("http://localhost:3000");
  });

  test("browser でなく production かつ NEXT_PUBLIC_SITE_URL がない場合は空文字を返す", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
    });

    try {
      const { getSiteUrlForClient } = await import("@/lib/public-env");

      expect(getSiteUrlForClient()).toBe("");
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      });
    }
  });

  test("isStripeTestMode は pk_test_ プレフィックスを判定する", async () => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";

    const { isStripeTestMode } = await import("@/lib/public-env");

    expect(isStripeTestMode()).toBe(true);
  });

  test("isStripeTestMode は live key では false を返す", async () => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_123";

    const { isStripeTestMode } = await import("@/lib/public-env");

    expect(isStripeTestMode()).toBe(false);
  });
});

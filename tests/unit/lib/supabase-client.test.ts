jest.mock("@supabase/ssr", () => ({
  createBrowserClient: jest.fn(),
}));

describe("Supabase browser client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("createClient は public env を使って browser client を作る", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const { createBrowserClient } = await import("@supabase/ssr");
    const mockCreateBrowserClient = jest.mocked(createBrowserClient);
    const browserClient = { auth: {} };
    mockCreateBrowserClient.mockReturnValue(browserClient as never);

    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(browserClient);
    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key"
    );
  });

  test("createClient は必須 env がなければ例外を投げる", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { createClient } = await import("@/lib/supabase/client");

    expect(() => createClient()).toThrow(
      "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables."
    );
  });
});

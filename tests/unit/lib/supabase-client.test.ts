jest.mock("@supabase/ssr", () => ({
  createBrowserClient: jest.fn(),
}));

type LockFn = <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
) => Promise<R>;

describe("Supabase browser client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function createClientAndCaptureLock(): Promise<LockFn> {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const { createBrowserClient } = await import("@supabase/ssr");
    const mockCreateBrowserClient = jest.mocked(createBrowserClient);
    mockCreateBrowserClient.mockReturnValue({ auth: {} } as never);

    const { createClient } = await import("@/lib/supabase/client");
    createClient();

    const lock = mockCreateBrowserClient.mock.calls[0][2]?.auth?.lock;
    expect(lock).toEqual(expect.any(Function));
    return lock as LockFn;
  }

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
      "anon-key",
      { auth: { lock: expect.any(Function) } }
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

  describe("タブ間ロック(navigator.locks)を使わないロック関数", () => {
    afterEach(() => {
      delete (window.navigator as { locks?: unknown }).locks;
    });

    test("ロック関数は処理をその場で1回呼び、その結果を返す", async () => {
      const lock = await createClientAndCaptureLock();
      const fn = jest.fn().mockResolvedValue(42);

      const result = lock("lock:sb-example-auth-token", 10000, fn);

      // このロック関数は自前では排他をしない。auth-js は「ロック関数が処理を同期的に
      // 始める」ことを前提に、同じタブの中の処理を自前の待ち行列で1つずつに並べる
      // (GoTrueClient._acquireLock の lockAcquired)。排他を持たないロック関数が
      // 呼び出しを後回しにすると、同じ瞬間に始まった認証処理が並行して走る。
      expect(fn).toHaveBeenCalledTimes(1);
      await expect(result).resolves.toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    // auth-js 2.90.1 がロック関数に渡す待ち時間は 10000(通常)と 0(自動更新の定期処理)
    test.each([10000, 0])(
      "ロック関数は navigator.locks を使わず処理をその場で呼ぶ(待ち時間 %i)",
      async (acquireTimeout) => {
        const request = jest.fn();
        Object.defineProperty(window.navigator, "locks", {
          configurable: true,
          value: { request },
        });
        const lock = await createClientAndCaptureLock();
        const fn = jest.fn().mockResolvedValue("done");

        const result = lock("lock:sb-example-auth-token", acquireTimeout, fn);

        expect(fn).toHaveBeenCalledTimes(1);
        await expect(result).resolves.toBe("done");
        expect(fn).toHaveBeenCalledTimes(1);
        expect(request).not.toHaveBeenCalled();
      }
    );

    test("ロック関数は処理の失敗をそのまま伝え、やり直さない", async () => {
      const lock = await createClientAndCaptureLock();
      const failure = new Error("refresh failed");
      const fn = jest.fn().mockRejectedValue(failure);

      await expect(lock("lock:sb-example-auth-token", 10000, fn)).rejects.toBe(
        failure
      );
      // 認証処理(トークン更新など)を勝手に再送しない
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

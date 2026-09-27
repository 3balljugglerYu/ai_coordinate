/** @jest-environment jsdom */

/**
 * ブラウザ用 Supabase クライアントが、タブ間ロック(navigator.locks)に止められないこと。
 *
 * 2026-09-27 の不具合: iPhone の Chrome で persta.ai を複数タブ開いていると、
 * 裏に回ったタブが認証処理の途中で止まり、タブ間ロックを握ったままになる。
 * supabase-js 2.90 の既定ではこのロックを最大10秒待ってから失敗し、その失敗が
 * ページの寿命中残るため、ヘッダーが「ログイン」に化け、ログアウトも届かなくなった。
 *
 * ここではモックではなく本物の @supabase/ssr / supabase-js を使い、
 * 「別タブがロックを握ったまま返さない」状態を navigator.locks の差し替えで作る。
 * 通信(/auth/v1/user)だけを fetch のモックで返す。
 */

const SUPABASE_URL = "https://testref.supabase.co";
const STORAGE_KEY = "sb-testref-auth-token";
const USER = {
  id: "00000000-0000-4000-8000-00000000abcd",
  aud: "authenticated",
  role: "authenticated",
  email: "lock-regression@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sessionCookieValue(): string {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = [
    toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    toBase64Url(
      JSON.stringify({ sub: USER.id, exp: now + 3600, role: "authenticated" })
    ),
    "signature",
  ].join(".");
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "refresh-token",
    user: USER,
  };
  return `base64-${toBase64Url(JSON.stringify(session))}`;
}

const TIMED_OUT = "timed-out";

/** 期限内に終わらなければ TIMED_OUT を返す(ハングを Jest のタイムアウトではなく検証の失敗にする) */
async function withinBudget<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("ブラウザ用 Supabase クライアント: 別タブのロック", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let lockRequest: jest.Mock;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
    // 別タブがロックを握ったまま返さない(= 裏で止まったタブ)
    lockRequest = jest.fn(() => new Promise(() => {}));
    Object.defineProperty(window.navigator, "locks", {
      configurable: true,
      value: { request: lockRequest },
    });
    document.cookie = `${STORAGE_KEY}=${sessionCookieValue()}; path=/`;
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => USER,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (window.navigator as { locks?: unknown }).locks;
    document.cookie = `${STORAGE_KEY}=; path=/; max-age=0`;
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  test("別タブがロックを握ったままでも getUser が返る", async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();

    try {
      const outcome = await withinBudget(client.auth.getUser(), 2000);

      expect(outcome).not.toBe(TIMED_OUT);
      if (outcome === TIMED_OUT) return;
      expect(outcome.error).toBeNull();
      expect(outcome.data.user?.id).toBe(USER.id);
      expect(fetchMock).toHaveBeenCalledWith(
        `${SUPABASE_URL}/auth/v1/user`,
        expect.objectContaining({ method: "GET" })
      );

      // 自動更新の初回(setTimeout 0 で予約される)も navigator.locks を使わない
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(lockRequest).not.toHaveBeenCalled();
    } finally {
      await client.auth.stopAutoRefresh();
    }
  });

  test("同じタブの認証処理は1つずつ実行される", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    fetchMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return { ok: true, status: 200, json: async () => USER };
    });
    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();

    try {
      // 同じ瞬間に2つ始めても、Supabase への問い合わせは同時に1本まで
      const outcome = await withinBudget(
        Promise.all([client.auth.getUser(), client.auth.getUser()]),
        2000
      );

      expect(outcome).not.toBe(TIMED_OUT);
      if (outcome === TIMED_OUT) return;
      expect(outcome.map((result) => result.data.user?.id)).toEqual([
        USER.id,
        USER.id,
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(maxInFlight).toBe(1);
    } finally {
      await client.auth.stopAutoRefresh();
    }
  });
});

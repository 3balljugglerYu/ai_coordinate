/** @jest-environment node */

const createClientMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/credits/balance/route";

function createGetRequest(): NextRequest {
  const request = new Request("http://localhost/api/credits/balance", {
    headers: { "accept-language": "ja" },
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

type CreditsQueryResult = {
  data: { balance?: number } | null;
  error: unknown | null;
};

function buildCreditsSupabase(opts: {
  user: { id: string } | null;
  creditsResult?: CreditsQueryResult;
}) {
  const getUser = jest.fn().mockResolvedValue({
    data: { user: opts.user },
    error: null,
  });

  const result: CreditsQueryResult = opts.creditsResult ?? {
    data: null,
    error: null,
  };
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const fromMock = jest.fn().mockImplementation((table: string) => {
    expect(table).toBe("user_credits");
    return { select };
  });

  return {
    supabase: { auth: { getUser }, from: fromMock },
    fromMock,
  };
}

describe("GET /api/credits/balance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { supabase } = buildCreditsSupabase({
      user: { id: "user-1" },
      creditsResult: { data: null, error: null },
    });
    createClientMock.mockResolvedValue(supabase);
  });

  test("GET_未ログインの場合_401で認証必須", async () => {
    // Spec: CREDITSBAL-001
    const { supabase, fromMock } = buildCreditsSupabase({ user: null });
    createClientMock.mockResolvedValue(supabase);

    const res = await GET(createGetRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.errorCode).toBe("CREDITS_AUTH_REQUIRED");
    expect(body.error).toBe("認証が必要です");
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("GET_Supabaseエラーの場合_500で残高取得失敗", async () => {
    // Spec: CREDITSBAL-002
    const { supabase } = buildCreditsSupabase({
      user: { id: "user-1" },
      creditsResult: { data: null, error: { message: "db error" } },
    });
    createClientMock.mockResolvedValue(supabase);

    const res = await GET(createGetRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("CREDITS_BALANCE_FETCH_FAILED");
    expect(body.error).toBe("ペルコイン残高の取得に失敗しました");
  });

  test("GET_残高行なしの場合_200でbalance0", async () => {
    // Spec: CREDITSBAL-003
    const { supabase } = buildCreditsSupabase({
      user: { id: "user-1" },
      creditsResult: { data: null, error: null },
    });
    createClientMock.mockResolvedValue(supabase);

    const res = await GET(createGetRequest());
    const body = (await res.json()) as { balance: number };

    expect(res.status).toBe(200);
    expect(body.balance).toBe(0);
  });

  test("GET_残高行ありの場合_200でbalanceを返す", async () => {
    // Spec: CREDITSBAL-004
    const { supabase } = buildCreditsSupabase({
      user: { id: "user-1" },
      creditsResult: { data: { balance: 250 }, error: null },
    });
    createClientMock.mockResolvedValue(supabase);

    const res = await GET(createGetRequest());
    const body = (await res.json()) as { balance: number };

    expect(res.status).toBe(200);
    expect(body.balance).toBe(250);
  });

  test("GET_未処理例外の場合_500で残高取得失敗", async () => {
    // Spec: CREDITSBAL-005
    createClientMock.mockRejectedValueOnce(new Error("client failed"));

    const res = await GET(createGetRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("CREDITS_BALANCE_FETCH_FAILED");
    expect(body.error).toBe("ペルコイン残高の取得に失敗しました");
  });
});

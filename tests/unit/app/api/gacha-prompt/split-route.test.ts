/** @jest-environment node */

/**
 * POST /api/gacha-prompt/split(「ガチャに分ける」)。
 *
 * ⭐ 分けられたときだけ5ペルコインを引き落とす。AI の失敗・分けられない出力・残高不足では
 * 引き落とさない(返金の経路を持たないため、順番が要)。
 */

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postGachaSplitRoute } from "@/app/api/gacha-prompt/split/handler";

const PROMPT = [
  "【職業ガチャ】",
  "このキャラクターに似合う職業をランダムに1つ選んでください。",
  "例：医師、パティシエ、探偵",
  "その職業で働いている瞬間を描く。",
].join("\n");

function createRequest(
  body: unknown,
  headers: Record<string, string> = { origin: "http://localhost", host: "localhost" },
): NextRequest {
  const request = new Request("http://localhost/api/gacha-prompt/split", {
    method: "POST",
    headers: { "Content-Type": "application/json", "accept-language": "ja", ...headers },
    body: JSON.stringify(body),
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function setup(overrides: Partial<Parameters<typeof postGachaSplitRoute>[1]> = {}) {
  const deductFn = jest.fn(async () => ({ balance: 95 }));
  const callModelFn = jest.fn(async () => ({
    removeLines: [2, 3],
    candidates: ["医師", "パティシエ", "探偵"],
  }));
  const revalidateFn = jest.fn();
  const deps = {
    getUserFn: jest.fn(async () => ({ id: "user-1" })) as never,
    isAvailableFn: jest.fn(() => true),
    isAdminFn: jest.fn(() => false),
    getBalanceFn: jest.fn(async () => 100),
    callModelFn: callModelFn as never,
    deductFn,
    revalidateFn,
    ...overrides,
  };
  return { deps, deductFn, callModelFn, revalidateFn };
}

async function errorCodeOf(response: Response) {
  return ((await response.json()) as { errorCode?: string }).errorCode;
}

describe("POST /api/gacha-prompt/split", () => {
  test("分けられたら本文と候補欄を返し、5ペルコインを1回だけ引き落とす", async () => {
    const { deps, deductFn, callModelFn, revalidateFn } = setup();

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      body: "【職業ガチャ】\nその職業で働いている瞬間を描く。",
      field: "{{GACHA}}\n1. 医師\n2. パティシエ\n3. 探偵\n{{/GACHA}}",
      removedLines: [2, 3],
      candidateCount: 3,
      balance: 95,
    });
    expect(callModelFn).toHaveBeenCalledWith(PROMPT);
    expect(deductFn).toHaveBeenCalledTimes(1);
    expect(deductFn).toHaveBeenCalledWith("user-1");
    expect(revalidateFn).toHaveBeenCalledWith("user-1", "ja");
  });

  test("分けられない出力なら 422 で、引き落とさない", async () => {
    const { deps, deductFn } = setup({
      callModelFn: (async () => ({ removeLines: [], candidates: [] })) as never,
    });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), deps);

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_NOT_SPLITTABLE");
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("候補が上限(10個)を超えたら 422 で、引き落とさない(減らせば分けられると伝える)", async () => {
    const many = Array.from({ length: 11 }, (_, i) => `職業${i + 1}`);
    const prompt = `職業の制服を着て働く姿。\n職業は、${many.join("、")}のどれか。`;
    const { deps, deductFn } = setup({
      callModelFn: (async () => ({ removeLines: [2], candidates: many })) as never,
    });

    const response = await postGachaSplitRoute(createRequest({ prompt }), deps);

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_TOO_MANY_CANDIDATES");
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("運営は候補が11個以上でも分けて、5ペルコインを引き落とす", async () => {
    const many = Array.from({ length: 11 }, (_, i) => `職業${i + 1}`);
    const prompt = `職業の制服を着て働く姿。\n職業は、${many.join("、")}のどれか。`;
    const { deps, deductFn } = setup({
      callModelFn: (async () => ({ removeLines: [2], candidates: many })) as never,
      isAdminFn: () => true,
    });

    const response = await postGachaSplitRoute(createRequest({ prompt }), deps);

    expect(response.status).toBe(200);
    expect(((await response.json()) as { candidateCount: number }).candidateCount).toBe(11);
    expect(deductFn).toHaveBeenCalledTimes(1);
  });

  test("AI が失敗したら 502 で、引き落とさない", async () => {
    const { deps, deductFn } = setup({
      callModelFn: (async () => {
        throw new Error("OpenAI 500");
      }) as never,
    });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), deps);

    expect(response.status).toBe(502);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_FAILED");
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("残高が5未満なら AI を呼ばずに断る", async () => {
    const { deps, deductFn, callModelFn } = setup({ getBalanceFn: async () => 4 });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), deps);

    expect(response.status).toBe(400);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_INSUFFICIENT_BALANCE");
    expect(callModelFn).not.toHaveBeenCalled();
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("残高がちょうど5なら使える", async () => {
    const { deps, deductFn } = setup({ getBalanceFn: async () => 5 });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), deps);

    expect(response.status).toBe(200);
    expect(deductFn).toHaveBeenCalledTimes(1);
  });

  test("未ログインは 401、使えない人は 403 で、AI を呼ばない", async () => {
    const guest = setup({ getUserFn: (async () => null) as never });
    const guestResponse = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), guest.deps);
    expect(guestResponse.status).toBe(401);
    expect(guest.callModelFn).not.toHaveBeenCalled();

    const blocked = setup({ isAvailableFn: () => false });
    const blockedResponse = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), blocked.deps);
    expect(blockedResponse.status).toBe(403);
    expect(await errorCodeOf(blockedResponse)).toBe("GACHA_SPLIT_UNAVAILABLE");
    expect(blocked.callModelFn).not.toHaveBeenCalled();
  });

  test.each([
    ["空", { prompt: "   " }],
    ["文字列でない", { prompt: 1 }],
    ["長すぎる", { prompt: "あ".repeat(30001) }],
  ])("本文が%sなら 400 で、AI を呼ばない", async (_label, body) => {
    const { deps, callModelFn } = setup();

    const response = await postGachaSplitRoute(createRequest(body), deps);

    expect(response.status).toBe(400);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_INVALID_PROMPT");
    expect(callModelFn).not.toHaveBeenCalled();
  });

  test("別のサイトからの送信は断る(CSRF)", async () => {
    const { deps, callModelFn, deductFn } = setup();

    const response = await postGachaSplitRoute(
      createRequest({ prompt: PROMPT }, { origin: "https://evil.example", host: "localhost" }),
      deps,
    );

    expect(response.status).toBe(403);
    expect(callModelFn).not.toHaveBeenCalled();
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("引き落としに失敗したら結果を返さない", async () => {
    const { deps } = setup({
      deductFn: async () => {
        throw new Error("deduct failed: 500");
      },
    });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), deps);

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_FAILED");
  });
});

describe("POST /api/gacha-prompt/split の引き落とし(既定の deduct_free_percoins)", () => {
  const createAdminClientMock = createAdminClient as jest.Mock;

  function mockAdminRpc(result: { data?: unknown; error?: { message: string; code?: string } | null }) {
    const rpc = jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
    createAdminClientMock.mockReturnValue({ rpc });
    return rpc;
  }

  function depsWithoutDeduct() {
    const { deps } = setup();
    // deductFn を渡さず、既定の deduct_free_percoins を通す
    return { ...deps, deductFn: undefined };
  }

  test("5ペルコインを reason=gacha_split で引き落とし、残高を返す", async () => {
    const rpc = mockAdminRpc({ data: [{ balance: 95, from_promo: 5, from_paid: 0 }] });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), depsWithoutDeduct());

    expect(response.status).toBe(200);
    expect(((await response.json()) as { balance: number }).balance).toBe(95);
    expect(rpc).toHaveBeenCalledWith("deduct_free_percoins", {
      p_user_id: "user-1",
      p_amount: 5,
      p_metadata: expect.objectContaining({ reason: "gacha_split", source: "gacha_split_api" }),
      p_related_generation_id: null,
    });
  });

  test("残高不足で RPC が断ったら 400 で、結果を返さない", async () => {
    mockAdminRpc({ error: { message: "insufficient balance", code: "P0001" } });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), depsWithoutDeduct());

    expect(response.status).toBe(400);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_INSUFFICIENT_BALANCE");
  });

  test("ほかの理由で RPC が失敗したら 500 で、結果を返さない", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockAdminRpc({ error: { message: "boom", code: "XX000" } });

    const response = await postGachaSplitRoute(createRequest({ prompt: PROMPT }), depsWithoutDeduct());

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe("GACHA_SPLIT_FAILED");
  });
});


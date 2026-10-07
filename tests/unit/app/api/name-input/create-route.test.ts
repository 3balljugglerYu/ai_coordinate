/** @jest-environment node */

/**
 * POST /api/name-input/create(「本文から名前の欄を作る」)。
 *
 * ⭐ 作れたときだけ5ペルコインを引き落とす。AI の失敗・名前の行が無い・残高不足では
 * 引き落とさない(返金の経路を持たないため、順番が要)。「ガチャに分ける」と同じ。
 */

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { NextRequest } from "next/server";
import { postNameInputCreateRoute } from "@/app/api/name-input/create/handler";

const PROMPT = [
  "{{INPUT:キャラクターの名前}}",
  "野菜のドレスを着たキャラクターを描く。",
  "【名前】〇〇",
  "※名前はそのまま胸元の名札に表示する",
].join("\n");

function createRequest(
  body: unknown,
  headers: Record<string, string> = { origin: "http://localhost", host: "localhost" },
): NextRequest {
  const request = new Request("http://localhost/api/name-input/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", "accept-language": "ja", ...headers },
    body: JSON.stringify(body),
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function setup(overrides: Partial<Parameters<typeof postNameInputCreateRoute>[1]> = {}) {
  const deductFn = jest.fn(async () => ({ balance: 95 }));
  // 目印を外した本文では、L2 が【名前】、L3 が※の行
  const callModelFn = jest.fn(async () => ({ inlineLine: 0, inlineText: "", removeLines: [2, 3] }));
  const revalidateFn = jest.fn();
  const deps = {
    getUserFn: jest.fn(async () => ({ id: "user-1" })) as never,
    isAvailableFn: jest.fn(() => true),
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

const SLOT = { label: "うちの子", placeholder: "例：ぺるこ", required: true };

describe("POST /api/name-input/create", () => {
  test("作れたら本文を返し、5ペルコインを1回だけ引き落とす", async () => {
    const { deps, deductFn, callModelFn, revalidateFn } = setup();

    const response = await postNameInputCreateRoute(createRequest({ prompt: PROMPT, slot: SLOT }), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      original: "野菜のドレスを着たキャラクターを描く。\n【名前】〇〇\n※名前はそのまま胸元の名札に表示する",
      body: "野菜のドレスを着たキャラクターを描く。\n{{INPUT*:うちの子|ぺるこ}}",
      removedLines: [2, 3],
      changedLine: null,
      balance: 95,
    });
    // AI には、今ある目印を外した本文を渡す
    expect(callModelFn).toHaveBeenCalledWith(
      "野菜のドレスを着たキャラクターを描く。\n【名前】〇〇\n※名前はそのまま胸元の名札に表示する",
    );
    expect(deductFn).toHaveBeenCalledTimes(1);
    expect(revalidateFn).toHaveBeenCalledTimes(1);
  });

  test("名前の行が見つからなければ 422 で、引き落とさない", async () => {
    const { deps, deductFn } = setup({ callModelFn: jest.fn(async () => ({ removeLines: [] })) as never });
    const response = await postNameInputCreateRoute(createRequest({ prompt: PROMPT, slot: SLOT }), deps);
    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe("NAME_INPUT_CREATE_NOT_FOUND");
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("AI の出力が壊れていたら(範囲外の行)引き落とさない", async () => {
    const { deps, deductFn } = setup({ callModelFn: jest.fn(async () => ({ removeLines: [99] })) as never });
    const response = await postNameInputCreateRoute(createRequest({ prompt: PROMPT, slot: SLOT }), deps);
    expect(response.status).toBe(502);
    expect(await errorCodeOf(response)).toBe("NAME_INPUT_CREATE_FAILED");
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("AI が失敗したら引き落とさない", async () => {
    const { deps, deductFn } = setup({
      callModelFn: jest.fn(async () => {
        throw new Error("boom");
      }) as never,
    });
    const response = await postNameInputCreateRoute(createRequest({ prompt: PROMPT, slot: SLOT }), deps);
    expect(response.status).toBe(502);
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("残高が5ペルコイン未満なら、AI を呼ばずに断る", async () => {
    const { deps, callModelFn } = setup({ getBalanceFn: jest.fn(async () => 4) });
    const response = await postNameInputCreateRoute(createRequest({ prompt: PROMPT, slot: SLOT }), deps);
    expect(response.status).toBe(400);
    expect(await errorCodeOf(response)).toBe("NAME_INPUT_CREATE_INSUFFICIENT_BALANCE");
    expect(callModelFn).not.toHaveBeenCalled();
  });

  test("引き落としに失敗したら 500(本文は返さない)", async () => {
    const { deps } = setup({
      deductFn: jest.fn(async () => {
        throw new Error("deduct failed: unknown");
      }),
    });
    const response = await postNameInputCreateRoute(createRequest({ prompt: PROMPT, slot: SLOT }), deps);
    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe("NAME_INPUT_CREATE_FAILED");
  });

  test("目印しかない本文は 400(AI を呼ばない)", async () => {
    const { deps, callModelFn } = setup();
    const response = await postNameInputCreateRoute(
      createRequest({ prompt: "{{INPUT:名前}}", slot: SLOT }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(await errorCodeOf(response)).toBe("NAME_INPUT_CREATE_INVALID_PROMPT");
    expect(callModelFn).not.toHaveBeenCalled();
  });

  test("欄の設定がおかしければ既定の見出し・任意に寄せる", async () => {
    const { deps } = setup();
    const response = await postNameInputCreateRoute(
      createRequest({ prompt: PROMPT, slot: { label: 3, required: "yes" } }),
      deps,
    );
    expect(((await response.json()) as { body: string }).body).toContain("{{INPUT:名前}}");
  });

  test("未ログインは 401・使えない人は 403・別のサイトからは断る", async () => {
    const guest = setup({ getUserFn: jest.fn(async () => null) as never });
    expect((await postNameInputCreateRoute(createRequest({ prompt: PROMPT }), guest.deps)).status).toBe(401);

    const blocked = setup({ isAvailableFn: jest.fn(() => false) });
    expect((await postNameInputCreateRoute(createRequest({ prompt: PROMPT }), blocked.deps)).status).toBe(403);

    const cross = setup();
    const response = await postNameInputCreateRoute(
      createRequest({ prompt: PROMPT }, { origin: "https://evil.example", host: "localhost" }),
      cross.deps,
    );
    expect(response.status).toBe(403);
    expect(cross.callModelFn).not.toHaveBeenCalled();
  });

  test("まとめた後の本文が長さの上限を超えるなら、引き落とさない", async () => {
    const long = `${"あ".repeat(29_990)}\n【名前】`;
    const { deps, deductFn } = setup({ callModelFn: jest.fn(async () => ({ removeLines: [2] })) as never });
    const response = await postNameInputCreateRoute(
      createRequest({ prompt: long, slot: { label: "とても長い見出しをつけたキャラクターの名前", required: true } }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("⭐本文にもう目印があるなら、AI を呼ばず・引き落とさずに断る(2026-10-07 報告)", async () => {
    const { deps, callModelFn, deductFn } = setup();
    const response = await postNameInputCreateRoute(
      createRequest({ prompt: "プレート\n1行目：「{{INPUT:お祝いする相手の名前|ぺる}}さん」", slot: SLOT }),
      deps,
    );
    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe("NAME_INPUT_CREATE_ALREADY_EXISTS");
    expect(callModelFn).not.toHaveBeenCalled();
    expect(deductFn).not.toHaveBeenCalled();
  });

  test("文中に差し込めたら、書き換えた行の番号も返す", async () => {
    const { deps } = setup({
      callModelFn: jest.fn(async () => ({ inlineLine: 2, inlineText: "〇〇", removeLines: [] })) as never,
    });
    const response = await postNameInputCreateRoute(
      createRequest({ prompt: "プレート\n1行目：「〇〇さん」", slot: { label: "相手", required: false } }),
      deps,
    );
    expect(await response.json()).toMatchObject({
      body: "プレート\n1行目：「{{INPUT:相手}}さん」",
      removedLines: [],
      changedLine: 2,
    });
  });
});


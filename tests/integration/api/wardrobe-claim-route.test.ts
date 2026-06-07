/** @jest-environment node */

import { NextRequest } from "next/server";
import {
  postWardrobeClaimRoute,
  WARDROBE_CLAIM_MAX_IMAGE_BYTES,
  WARDROBE_CLAIM_MAX_PER_USER,
} from "@/app/api/wardrobe/claim/handler";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/wardrobe/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    getUserFn: jest.fn().mockResolvedValue({ id: "user-1" }),
    saveWardrobeImageFn: jest.fn().mockResolvedValue({ id: "img-99" }),
    recordStyleUsageEventFn: jest.fn().mockResolvedValue(undefined),
    countWardrobeClaimsFn: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("postWardrobeClaimRoute", () => {
  test("正常: 保存し wardrobe_save_completed を記録し 200 {id} を返す", async () => {
    // save の戻り id がそのまま応答に出ることを pin (ハードコード stub を弾く)
    const deps = makeDeps({
      saveWardrobeImageFn: jest.fn().mockResolvedValue({ id: "saved-42" }),
    });
    const res = await postWardrobeClaimRoute(
      buildRequest({
        imageBase64: TINY_PNG_DATA_URL,
        styleId: "style-1",
        prompt: "梅コーデ",
        width: 768,
        height: 1024,
      }),
      deps,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: "saved-42" });

    expect(deps.saveWardrobeImageFn).toHaveBeenCalledTimes(1);
    const saveArg = deps.saveWardrobeImageFn.mock.calls[0][0];
    expect(saveArg).toMatchObject({
      userId: "user-1",
      contentType: "image/png",
      styleId: "style-1",
      prompt: "梅コーデ",
      model: null,
      width: 768,
      height: 1024,
    });
    expect(Buffer.isBuffer(saveArg.imageBuffer)).toBe(true);

    expect(deps.recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: "user-1",
      authState: "authenticated",
      eventType: "wardrobe_save_completed",
      styleId: "style-1",
    });
  });

  test("正常: styleId/prompt 無しは null で保存", async () => {
    const deps = makeDeps();
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: TINY_PNG_DATA_URL }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(deps.saveWardrobeImageFn.mock.calls[0][0]).toMatchObject({
      styleId: null,
      prompt: null,
    });
    expect(deps.recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: "user-1",
      authState: "authenticated",
      eventType: "wardrobe_save_completed",
      styleId: null,
    });
  });

  test("未認証: 401、保存も記録もしない", async () => {
    const deps = makeDeps({ getUserFn: jest.fn().mockResolvedValue(null) });
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: TINY_PNG_DATA_URL }),
      deps,
    );
    expect(res.status).toBe(401);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_UNAUTHORIZED");
    expect(deps.saveWardrobeImageFn).not.toHaveBeenCalled();
    expect(deps.recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("画像欠落: 400 MISSING_IMAGE、保存しない", async () => {
    const deps = makeDeps();
    const res = await postWardrobeClaimRoute(
      buildRequest({ styleId: "s1" }),
      deps,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_MISSING_IMAGE");
    expect(deps.saveWardrobeImageFn).not.toHaveBeenCalled();
  });

  test("壊れた JSON ボディ: 400 MISSING_IMAGE、保存しない", async () => {
    const deps = makeDeps();
    const req = new NextRequest("http://localhost/api/wardrobe/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const res = await postWardrobeClaimRoute(req, deps);
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_MISSING_IMAGE");
    expect(deps.saveWardrobeImageFn).not.toHaveBeenCalled();
  });

  test("非画像 data URL: 400 INVALID_IMAGE", async () => {
    const deps = makeDeps();
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: "data:text/plain;base64,aGVsbG8=" }),
      deps,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_INVALID_IMAGE");
    expect(deps.saveWardrobeImageFn).not.toHaveBeenCalled();
  });

  test("上限超過: 413 IMAGE_TOO_LARGE", async () => {
    const deps = makeDeps();
    const oversized = `data:image/webp;base64,${Buffer.alloc(
      WARDROBE_CLAIM_MAX_IMAGE_BYTES + 1,
    ).toString("base64")}`;
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: oversized }),
      deps,
    );
    expect(res.status).toBe(413);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_IMAGE_TOO_LARGE");
    expect(deps.saveWardrobeImageFn).not.toHaveBeenCalled();
  });

  test("保存失敗(storage/DB throw): 500、イベントは記録しない", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deps = makeDeps({
      saveWardrobeImageFn: jest
        .fn()
        .mockRejectedValue(new Error("storage down")),
    });
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: TINY_PNG_DATA_URL }),
      deps,
    );
    expect(res.status).toBe(500);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_SAVE_FAILED");
    expect(deps.recordStyleUsageEventFn).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("耐性: 保存は成功し計測記録だけ失敗しても 200 {id}", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deps = makeDeps({
      recordStyleUsageEventFn: jest
        .fn()
        .mockRejectedValue(new Error("events table down")),
    });
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: TINY_PNG_DATA_URL }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "img-99" });
    expect(deps.saveWardrobeImageFn).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  test("生涯上限(既に claim 済み)到達: 429 で保存も記録もしない", async () => {
    const deps = makeDeps({
      countWardrobeClaimsFn: jest
        .fn()
        .mockResolvedValue(WARDROBE_CLAIM_MAX_PER_USER),
    });
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: TINY_PNG_DATA_URL }),
      deps,
    );
    expect(res.status).toBe(429);
    expect((await res.json()).errorCode).toBe("WARDROBE_CLAIM_ALREADY_CLAIMED");
    expect(deps.countWardrobeClaimsFn).toHaveBeenCalledWith("user-1");
    expect(deps.saveWardrobeImageFn).not.toHaveBeenCalled();
    expect(deps.recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("カウント取得失敗は fail-open: 保存を優先して 200", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deps = makeDeps({
      countWardrobeClaimsFn: jest
        .fn()
        .mockRejectedValue(new Error("count query down")),
    });
    const res = await postWardrobeClaimRoute(
      buildRequest({ imageBase64: TINY_PNG_DATA_URL }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(deps.saveWardrobeImageFn).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  test("WARDROBE_CLAIM_MAX_PER_USER は 1(生涯1回)", () => {
    expect(WARDROBE_CLAIM_MAX_PER_USER).toBe(1);
  });
});

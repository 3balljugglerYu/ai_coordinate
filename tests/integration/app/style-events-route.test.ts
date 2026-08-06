/** @jest-environment node */

import { NextRequest } from "next/server";
import { postStyleEventsRoute } from "@/app/(app)/style/events/handler";

type JsonRecord = Record<string, unknown>;
const STYLE_ID = "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/style/events", {
    method: "POST",
    headers: {
      "accept-language": "ja",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

/**
 * getPublishedStylePresetById が返す公開中プリセットの最小形。
 * 記録ゲート(shouldRecordStylePresetUsage)が category の公開状態を読むため、
 * カテゴリを含めて返す(実リポジトリの戻り値と同じく category 必須)。
 */
function buildPublicPreset(categoryOverrides: Record<string, unknown> = {}) {
  return {
    id: STYLE_ID,
    category: {
      visibility: "public",
      isActive: true,
      collectionDisplayStartsAt: null,
      collectionDisplayEndsAt: null,
      ...categoryOverrides,
    },
  };
}

describe("StyleEventsRoute integration tests", () => {
  let getUserFn: jest.Mock;
  let getAdminUserIdsFn: jest.Mock;
  let getPublishedStylePresetByIdFn: jest.Mock;
  let recordStyleUsageEventFn: jest.Mock<Promise<void>, [unknown]>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
    getAdminUserIdsFn = jest.fn().mockReturnValue([]);
    getPublishedStylePresetByIdFn = jest
      .fn()
      .mockImplementation(async (styleId: string) =>
        styleId === STYLE_ID ? buildPublicPreset() : null
      );
    recordStyleUsageEventFn = jest.fn().mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      // keep test output deterministic
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test("postStyleEventsRoute_未認証の場合_guestとして200を返す", async () => {
    getUserFn.mockResolvedValueOnce(null);

    const response = await postStyleEventsRoute(
      createRequest({ eventType: "visit", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: null,
      authState: "guest",
      eventType: "visit",
      styleId: STYLE_ID,
    });
  });

  test("postStyleEventsRoute_不正eventTypeの場合_400を返す", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "invalid-event", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("無効な利用イベントです。");
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleEventsRoute_generateイベントも記録できる", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "generate", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: "user-123",
      authState: "authenticated",
      eventType: "generate",
      styleId: STYLE_ID,
    });
  });

  test("postStyleEventsRoute_不正styleIdの場合_400を返す", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "download", styleId: "unknown-style" }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("無効なスタイルです。");
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleEventsRoute_正常系の場合_200を返してイベントを記録する", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "download", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: "user-123",
      authState: "authenticated",
      eventType: "download",
      styleId: STYLE_ID,
    });
  });

  test("postStyleEventsRoute_管理者の場合_adminOnlyプリセットを許可して検証する", async () => {
    getUserFn.mockResolvedValueOnce({ id: "admin-1" });
    getAdminUserIdsFn.mockReturnValueOnce(["admin-1"]);

    const response = await postStyleEventsRoute(
      createRequest({ eventType: "download", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(getPublishedStylePresetByIdFn).toHaveBeenCalledWith(STYLE_ID, {
      includeAdminOnly: true,
    });
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: "admin-1",
      authState: "authenticated",
      eventType: "download",
      styleId: STYLE_ID,
    });
  });

  // 記録ゲート(shouldRecordStylePresetUsage): 公開中でないプリセットに紐づく
  // 利用イベントは記録しない。エラーではなく ok を返す(UX 影響なし)。
  test("postStyleEventsRoute_adminOnlyカテゴリのプリセットは記録せずokを返す(公開前テスト除外)", async () => {
    getUserFn.mockResolvedValueOnce({ id: "admin-1" });
    getAdminUserIdsFn.mockReturnValueOnce(["admin-1"]);
    getPublishedStylePresetByIdFn.mockResolvedValueOnce(
      buildPublicPreset({ visibility: "admin_only" })
    );

    const response = await postStyleEventsRoute(
      createRequest({ eventType: "generate", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleEventsRoute_表示期間外のプリセットは記録せずokを返す", async () => {
    getPublishedStylePresetByIdFn.mockResolvedValueOnce(
      buildPublicPreset({ collectionDisplayEndsAt: "2020-01-01T00:00:00Z" })
    );

    const response = await postStyleEventsRoute(
      createRequest({ eventType: "generate", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleEventsRoute_inactiveカテゴリのプリセットは記録せずokを返す", async () => {
    getPublishedStylePresetByIdFn.mockResolvedValueOnce(
      buildPublicPreset({ isActive: false })
    );

    const response = await postStyleEventsRoute(
      createRequest({ eventType: "download", styleId: STYLE_ID }),
      {
        getUserFn,
        getAdminUserIdsFn,
        getPublishedStylePresetByIdFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });
});

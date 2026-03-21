/** @jest-environment node */

import { NextRequest } from "next/server";
import { postStyleEventsRoute } from "@/app/(app)/style/events/handler";

type JsonRecord = Record<string, unknown>;

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

describe("StyleEventsRoute integration tests", () => {
  let getUserFn: jest.Mock;
  let recordStyleUsageEventFn: jest.Mock<Promise<void>, [unknown]>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
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
      createRequest({ eventType: "visit", styleId: "paris_code" }),
      {
        getUserFn,
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
      styleId: "paris_code",
    });
  });

  test("postStyleEventsRoute_不正eventTypeの場合_400を返す", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "invalid-event", styleId: "paris_code" }),
      {
        getUserFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("無効な利用イベントです。");
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleEventsRoute_generateイベントはpublic routeで受け付けない", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "generate", styleId: "paris_code" }),
      {
        getUserFn,
        recordStyleUsageEventFn,
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("無効な利用イベントです。");
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleEventsRoute_不正styleIdの場合_400を返す", async () => {
    const response = await postStyleEventsRoute(
      createRequest({ eventType: "download", styleId: "unknown-style" }),
      {
        getUserFn,
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
      createRequest({ eventType: "download", styleId: "paris_code" }),
      {
        getUserFn,
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
      styleId: "paris_code",
    });
  });
});

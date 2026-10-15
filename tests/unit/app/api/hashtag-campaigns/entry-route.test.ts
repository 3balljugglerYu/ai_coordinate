/** @jest-environment node */

/**
 * POST /api/hashtag-campaigns/[key]/entry(エントリー。2026-10-15 ユーザー決定)。
 *
 * 抽選はエントリーした人だけ。受け付けは期間の終わりまで(判定は DB の enter_hashtag_campaign)。
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { NextRequest } from "next/server";
import { postHashtagCampaignEntryRoute } from "@/app/api/hashtag-campaigns/[key]/entry/handler";

function createRequest(headers: Record<string, string> = { origin: "http://localhost", host: "localhost" }) {
  const request = new Request("http://localhost/api/hashtag-campaigns/halloween-best-shot/entry", {
    method: "POST",
    headers,
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function setup(entered: string | null = "2026-10-17T01:02:03+00:00", user: { id: string } | null = { id: "user-1" }) {
  return {
    getUserFn: jest.fn(async () => user) as never,
    enterFn: jest.fn(async () => entered),
  };
}

describe("POST /api/hashtag-campaigns/[key]/entry", () => {
  test("エントリーした日時を返す(本人の ID で登録する)", async () => {
    const deps = setup();
    const response = await postHashtagCampaignEntryRoute(createRequest(), "halloween-best-shot", deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enteredAt: "2026-10-17T01:02:03.000Z" });
    expect(deps.enterFn).toHaveBeenCalledWith("halloween-best-shot", "user-1");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("未ログインは 401(登録しない)", async () => {
    const deps = setup(undefined, null);
    const response = await postHashtagCampaignEntryRoute(createRequest(), "halloween-best-shot", deps);
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_AUTH_REQUIRED");
    expect(deps.enterFn).not.toHaveBeenCalled();
  });

  test("受け付けが終わっていれば 409", async () => {
    const deps = setup(null);
    const response = await postHashtagCampaignEntryRoute(createRequest(), "halloween-best-shot", deps);
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_ENTRY_CLOSED");
  });

  test("ほかのサイトからの送信は弾く(登録しない)", async () => {
    const deps = setup();
    const response = await postHashtagCampaignEntryRoute(
      createRequest({ origin: "https://evil.example", host: "localhost" }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(403);
    expect(deps.enterFn).not.toHaveBeenCalled();
  });

  test("キーの形が違えば 404(登録しない)", async () => {
    const deps = setup();
    const response = await postHashtagCampaignEntryRoute(createRequest(), "Bad/Key", deps);
    expect(response.status).toBe(404);
    expect(deps.enterFn).not.toHaveBeenCalled();
  });

  test("書き込めなければ 500", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = {
      getUserFn: jest.fn(async () => ({ id: "user-1" })) as never,
      enterFn: jest.fn(async () => {
        throw new Error("boom");
      }),
    };
    const response = await postHashtagCampaignEntryRoute(createRequest(), "halloween-best-shot", deps);
    expect(response.status).toBe(500);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_ENTRY_FAILED");
    consoleError.mockRestore();
  });
});

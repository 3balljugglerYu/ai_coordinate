/** @jest-environment node */

/**
 * POST /api/hashtag-campaigns/[key]/celebration(口数のお祝いを出したことを残す。2026-10-17)。
 *
 * お祝いは1口ごとに1回。エントリーした人だけ・届いた口数まで・値は上げるだけ。
 */

const mockCreateAdminClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

import type { NextRequest } from "next/server";
import { postHashtagCampaignCelebrationRoute } from "@/app/api/hashtag-campaigns/[key]/celebration/handler";

const SAME_ORIGIN = { origin: "http://localhost", host: "localhost", "content-type": "application/json" };

function createRequest(body: unknown, headers: Record<string, string> = SAME_ORIGIN) {
  const request = new Request("http://localhost/api/hashtag-campaigns/halloween-best-shot/celebration", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

type Row = { used_works: number | null; entered_at: string | null; celebrated_tickets: number | null };

function setup(
  row: Row | null = { used_works: 3, entered_at: "2026-10-16T11:00:00+00:00", celebrated_tickets: 0 },
  user: { id: string } | null = { id: "user-1" },
) {
  return {
    getUserFn: jest.fn(async () => user) as never,
    fetchProgressFn: jest.fn(async () => row),
    recordFn: jest.fn(async () => undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/hashtag-campaigns/[key]/celebration", () => {
  test("届いた口数を、本人の行に残す", async () => {
    const deps = setup();
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ celebratedTickets: 1 });
    expect(deps.fetchProgressFn).toHaveBeenCalledWith("halloween-best-shot", "user-1");
    expect(deps.recordFn).toHaveBeenCalledWith("halloween-best-shot", "user-1", 1);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("飛ばして届いた口数(6作品で、まだ0口のお祝い)は、いちばん上の口数をそのまま残せる", async () => {
    const deps = setup({ used_works: 6, entered_at: "2026-10-16T11:00:00+00:00", celebrated_tickets: 0 });
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 2 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.recordFn).toHaveBeenCalledWith("halloween-best-shot", "user-1", 2);
  });

  test("もっと上まで出していれば、その値を返す(下げない)", async () => {
    const deps = setup({ used_works: 10, entered_at: "2026-10-16T11:00:00+00:00", celebrated_tickets: 3 });
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 2 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ celebratedTickets: 3 });
  });

  test("届いていない口数は 409(残さない)", async () => {
    const deps = setup({ used_works: 5, entered_at: "2026-10-16T11:00:00+00:00", celebrated_tickets: 1 });
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 2 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_TICKETS_NOT_REACHED");
    expect(deps.recordFn).not.toHaveBeenCalled();
  });

  test("エントリーしていなければ 409(残さない)", async () => {
    const deps = setup({ used_works: 3, entered_at: null, celebrated_tickets: null });
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_NOT_ENTERED");
    expect(deps.recordFn).not.toHaveBeenCalled();
  });

  test("未ログインは 401(読みも書きもしない)", async () => {
    const deps = setup(undefined, null);
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_AUTH_REQUIRED");
    expect(deps.fetchProgressFn).not.toHaveBeenCalled();
    expect(deps.recordFn).not.toHaveBeenCalled();
  });

  test.each([
    ["口数がない", {}],
    ["0口", { tickets: 0 }],
    ["最大(3口)より多い", { tickets: 4 }],
    ["整数でない", { tickets: 1.5 }],
    ["文字", { tickets: "1" }],
    ["JSON でない", "tickets=1"],
  ])("口数がおかしければ 400(%s)", async (_label, body) => {
    const deps = setup();
    const response = await postHashtagCampaignCelebrationRoute(createRequest(body), "halloween-best-shot", deps);
    expect(response.status).toBe(400);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_INVALID_TICKETS");
    expect(deps.recordFn).not.toHaveBeenCalled();
  });

  test.each([
    ["形の違うキー", "Halloween_Best"],
    ["しきい値を知らない企画", "another-campaign"],
  ])("%sは 404(読まない)", async (_label, key) => {
    const deps = setup();
    const response = await postHashtagCampaignCelebrationRoute(createRequest({ tickets: 1 }), key, deps);
    expect(response.status).toBe(404);
    expect(deps.fetchProgressFn).not.toHaveBeenCalled();
  });

  test("DB に企画がなければ 404", async () => {
    const deps = setup(null);
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(404);
    expect(deps.recordFn).not.toHaveBeenCalled();
  });

  test("ほかのサイトからの送信は弾く(読みも書きもしない)", async () => {
    const deps = setup();
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }, { origin: "https://evil.example", host: "localhost", "content-type": "application/json" }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(403);
    expect(deps.fetchProgressFn).not.toHaveBeenCalled();
    expect(deps.recordFn).not.toHaveBeenCalled();
  });

  test("進み具合を読めなければ 500(書かない)", async () => {
    const deps = setup();
    deps.fetchProgressFn.mockRejectedValueOnce(new Error("boom"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(500);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_CELEBRATION_FAILED");
    expect(deps.recordFn).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("書けなければ 500", async () => {
    const deps = setup();
    deps.recordFn.mockRejectedValueOnce(new Error("boom"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const response = await postHashtagCampaignCelebrationRoute(
      createRequest({ tickets: 1 }),
      "halloween-best-shot",
      deps,
    );
    expect(response.status).toBe(500);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_CELEBRATION_FAILED");
    errorSpy.mockRestore();
  });

  describe("既定の読み書き(service_role)", () => {
    function adminMock({ updateError = null }: { updateError?: { code: string } | null } = {}) {
      const calls: { method: string; args: unknown[] }[] = [];
      const builder: Record<string, unknown> = {};
      for (const method of ["update", "eq"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      }
      builder.lt = async (...args: unknown[]) => {
        calls.push({ method: "lt", args });
        return { error: updateError };
      };
      const rpc = jest.fn(() => ({
        maybeSingle: async () => ({
          data: { used_works: 6, entered_at: "2026-10-16T11:00:00+00:00", celebrated_tickets: 1 },
          error: null,
        }),
      }));
      const from = jest.fn(() => builder);
      mockCreateAdminClient.mockReturnValue({ rpc, from });
      return { calls, rpc, from };
    }

    test("進み具合は企画ページと同じ RPC で読み、本人の行だけを、今より大きいときだけ上げる", async () => {
      const admin = adminMock();
      const response = await postHashtagCampaignCelebrationRoute(
        createRequest({ tickets: 2 }),
        "halloween-best-shot",
        { getUserFn: jest.fn(async () => ({ id: "user-1" })) as never },
      );
      expect(response.status).toBe(200);
      expect(admin.rpc).toHaveBeenCalledWith("get_hashtag_campaign_progress", {
        p_campaign_key: "halloween-best-shot",
        p_user_id: "user-1",
      });
      expect(admin.from).toHaveBeenCalledWith("hashtag_campaign_entries");
      expect(admin.calls).toEqual([
        { method: "update", args: [{ celebrated_tickets: 2 }] },
        { method: "eq", args: ["campaign_key", "halloween-best-shot"] },
        { method: "eq", args: ["user_id", "user-1"] },
        { method: "lt", args: ["celebrated_tickets", 2] },
      ]);
    });

    test("書き込みのエラーは 500", async () => {
      adminMock({ updateError: { code: "42501" } });
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const response = await postHashtagCampaignCelebrationRoute(
        createRequest({ tickets: 2 }),
        "halloween-best-shot",
        { getUserFn: jest.fn(async () => ({ id: "user-1" })) as never },
      );
      expect(response.status).toBe(500);
      errorSpy.mockRestore();
    });
  });
});

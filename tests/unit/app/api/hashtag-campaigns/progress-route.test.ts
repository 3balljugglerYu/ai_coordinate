/** @jest-environment node */

/**
 * GET /api/hashtag-campaigns/[key]/progress(企画ページの進捗カード)。
 *
 * 期間は DB が正本なので未ログインでも返す。本人の数(使ったちがう応募作)と
 * エントリーの有無は、ログイン中だけ返す。本人ごとに違うので共有キャッシュに載せない。
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { getHashtagCampaignProgressRoute } from "@/app/api/hashtag-campaigns/[key]/progress/handler";

type Row = {
  starts_at: string;
  ends_at: string;
  used_works: number | null;
  entered_at: string | null;
  celebrated_tickets: number | null;
};

const ROW: Row = {
  starts_at: "2026-10-16T11:00:00+00:00",
  ends_at: "2026-10-31T15:00:00+00:00",
  used_works: 4,
  entered_at: "2026-10-17T01:02:03+00:00",
  celebrated_tickets: 1,
};

function setup(row: Row | null = ROW, user: { id: string } | null = { id: "user-1" }) {
  const fetchProgressFn = jest.fn(async () => row);
  const getUserFn = jest.fn(async () => user) as never;
  return { fetchProgressFn, getUserFn };
}

describe("GET /api/hashtag-campaigns/[key]/progress", () => {
  test("ログイン中: 期間・使った数・エントリー日時・お祝いの口数を返す(本人の ID で数える)", async () => {
    const deps = setup();
    const response = await getHashtagCampaignProgressRoute("halloween-best-shot", deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      startsAt: "2026-10-16T11:00:00.000Z",
      endsAt: "2026-10-31T15:00:00.000Z",
      viewer: { enteredAt: "2026-10-17T01:02:03.000Z", usedWorks: 4, celebratedTickets: 1 },
    });
    expect(deps.fetchProgressFn).toHaveBeenCalledWith("halloween-best-shot", "user-1");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("未エントリーなら enteredAt は null(数はエントリー前の投稿も含めて返す)", async () => {
    const deps = setup({ ...ROW, entered_at: null, celebrated_tickets: 0 });
    const body = await (await getHashtagCampaignProgressRoute("halloween-best-shot", deps)).json();
    expect(body.viewer).toEqual({ enteredAt: null, usedWorks: 4, celebratedTickets: 0 });
  });

  test("未ログイン: 期間だけ返し viewer は null(DB には user なしで問い合わせる)", async () => {
    const deps = setup({ ...ROW, used_works: 0, entered_at: null, celebrated_tickets: 0 }, null);
    const response = await getHashtagCampaignProgressRoute("halloween-best-shot", deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.viewer).toBeNull();
    expect(body.startsAt).toBe("2026-10-16T11:00:00.000Z");
    expect(deps.fetchProgressFn).toHaveBeenCalledWith("halloween-best-shot", null);
  });

  test("数が壊れた値(null・負)なら 0 にそろえる", async () => {
    const deps = setup({ ...ROW, used_works: null, celebrated_tickets: -1 });
    const body = await (await getHashtagCampaignProgressRoute("halloween-best-shot", deps)).json();
    expect(body.viewer.usedWorks).toBe(0);
    expect(body.viewer.celebratedTickets).toBe(0);
  });

  test("知らない企画は 404", async () => {
    const deps = setup(null);
    const response = await getHashtagCampaignProgressRoute("no-such-campaign", deps);
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_NOT_FOUND");
  });

  test("キーの形が違えば DB に問い合わせずに 404", async () => {
    const deps = setup();
    const response = await getHashtagCampaignProgressRoute("Bad/Key", deps);
    expect(response.status).toBe(404);
    expect(deps.fetchProgressFn).not.toHaveBeenCalled();
  });

  test("読めなければ 500", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = {
      getUserFn: jest.fn(async () => ({ id: "user-1" })) as never,
      fetchProgressFn: jest.fn(async () => {
        throw new Error("boom");
      }),
    };
    const response = await getHashtagCampaignProgressRoute("halloween-best-shot", deps);
    expect(response.status).toBe(500);
    expect((await response.json()).errorCode).toBe("HASHTAG_CAMPAIGN_PROGRESS_FAILED");
    consoleError.mockRestore();
  });
});

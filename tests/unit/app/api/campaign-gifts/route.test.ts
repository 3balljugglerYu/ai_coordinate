/** @jest-environment node */

/**
 * GET/POST /api/campaign-gifts/[key](企画の贈り物。2026-10-26 ユーザー決定)。
 * 人はセッションで決め、額・期間・1人1回の判定は DB が持つ。
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));

import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getCampaignGiftRoute, postCampaignGiftRoute } from "@/app/api/campaign-gifts/[key]/handler";

function createRequest(headers: Record<string, string> = { origin: "http://localhost", host: "localhost" }) {
  const request = new Request("http://localhost/api/campaign-gifts/halloween-best-shot", { method: "POST", headers });
  return Object.assign(request, { nextUrl: new URL(request.url), cookies: { get: () => undefined } }) as NextRequest;
}

const USER = { id: "user-1" };
const EXPIRE = "2026-10-31T23:59:00+09:00";

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET(受け取れるか)", () => {
  test("ログインしていない人は、人なしで聞き、受け取っていない扱い", async () => {
    const getStatusFn = jest.fn(async () => ({ open: true, claimed: false, amount: 200, expire_at: EXPIRE }));
    const response = await getCampaignGiftRoute("halloween-best-shot", { getUserFn: jest.fn(async () => null) as never, getStatusFn });
    expect(getStatusFn).toHaveBeenCalledWith("halloween-best-shot", null);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      open: true,
      claimed: false,
      signedIn: false,
      amount: 200,
      expireAt: "2026-10-31T14:59:00.000Z",
    });
  });

  test("ログインしている人は、その人で聞く", async () => {
    const getStatusFn = jest.fn(async () => ({ open: true, claimed: true, amount: 200, expire_at: EXPIRE }));
    const response = await getCampaignGiftRoute("halloween-best-shot", { getUserFn: jest.fn(async () => USER) as never, getStatusFn });
    expect(getStatusFn).toHaveBeenCalledWith("halloween-best-shot", "user-1");
    await expect(response.json()).resolves.toMatchObject({ claimed: true, signedIn: true });
  });

  test("知らない企画は 404、DB が読めなければ 500", async () => {
    expect((await getCampaignGiftRoute("unknown", { getUserFn: jest.fn(async () => null) as never })).status).toBe(404);
    const response = await getCampaignGiftRoute("halloween-best-shot", {
      getUserFn: jest.fn(async () => null) as never,
      getStatusFn: jest.fn(async () => {
        throw new Error("boom");
      }),
    });
    expect(response.status).toBe(500);
  });
});

describe("POST(受け取る)", () => {
  test("受け取れたら額と期限を返し、残高の画面のキャッシュを新しくする", async () => {
    const claimFn = jest.fn(async () => ({ status: "granted", amount: 200, expire_at: EXPIRE }));
    const revalidateFn = jest.fn();
    const response = await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn,
      revalidateFn,
    });
    expect(claimFn).toHaveBeenCalledWith("halloween-best-shot", "user-1");
    expect(revalidateFn).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({ status: "granted", amount: 200, expireAt: "2026-10-31T14:59:00.000Z" });
  });

  test("もう受け取っていれば already_claimed(キャッシュは触らない)", async () => {
    const revalidateFn = jest.fn();
    const response = await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn: jest.fn(async () => ({ status: "already_claimed" })),
      revalidateFn,
    });
    await expect(response.json()).resolves.toEqual({ status: "already_claimed" });
    expect(revalidateFn).not.toHaveBeenCalled();
  });

  test.each(["closed", "not_found"])("DB が %s を返したら closed", async (status) => {
    const response = await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn: jest.fn(async () => ({ status })),
      revalidateFn: jest.fn(),
    });
    await expect(response.json()).resolves.toEqual({ status: "closed" });
  });

  test("ログインしていなければ 401、知らない企画は 404、別のサイトからは断る", async () => {
    const claimFn = jest.fn();
    expect(
      (await postCampaignGiftRoute(createRequest(), "halloween-best-shot", { getUserFn: jest.fn(async () => null) as never, claimFn })).status,
    ).toBe(401);
    expect((await postCampaignGiftRoute(createRequest(), "unknown", { getUserFn: jest.fn(async () => USER) as never, claimFn })).status).toBe(404);
    const crossSite = await postCampaignGiftRoute(createRequest({ origin: "https://evil.example", host: "localhost" }), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn,
    });
    expect(crossSite.status).toBe(403);
    expect(claimFn).not.toHaveBeenCalled();
  });

  test("DB が失敗したとき・思わない返事のときは 500", async () => {
    const thrown = await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn: jest.fn(async () => {
        throw new Error("boom");
      }),
    });
    expect(thrown.status).toBe(500);
    const odd = await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn: jest.fn(async () => ({ status: "granted" })),
      revalidateFn: jest.fn(),
    });
    expect(odd.status).toBe(500);
  });

  test("キャッシュの更新に失敗しても、受け取れた返事は返す", async () => {
    const response = await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
      getUserFn: jest.fn(async () => USER) as never,
      claimFn: jest.fn(async () => ({ status: "granted", amount: 200, expire_at: EXPIRE })),
      revalidateFn: jest.fn(() => {
        throw new Error("cache");
      }),
    });
    expect(response.status).toBe(200);
  });
});

test("受け取れたら、マイページと生成の画面の残高のキャッシュを、古い値を返さない形で消す", async () => {
  (revalidateTag as jest.Mock).mockClear();
  await postCampaignGiftRoute(createRequest(), "halloween-best-shot", {
    getUserFn: jest.fn(async () => USER) as never,
    claimFn: jest.fn(async () => ({ status: "granted", amount: 200, expire_at: EXPIRE })),
  });
  const calls = (revalidateTag as jest.Mock).mock.calls;
  expect(calls.map((c) => c[0]).sort()).toEqual(
    ["challenge-user-1", "coordinate-user-1-ja", "free-user-1-ja", "my-page-credits-user-1", "my-page-user-1", "style-user-1-ja"].sort(),
  );
  for (const call of calls) expect(call[1]).toEqual({ expire: 0 });
});


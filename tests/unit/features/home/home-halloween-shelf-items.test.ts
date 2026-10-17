/** @jest-environment node */

/**
 * ホームの「ハロウィン企画」の棚に並べる作品(2026-10-17)。
 * 期間外は読まない・企画ページの一覧と同じ並びの先頭から12件・読めなくても投げない
 * (投げると、同じ区画の「簡単お着替え」まで出なくなる)。
 */

jest.mock("@/features/campaigns/hashtag-campaign/get-submission-pages", () => ({
  getCampaignSubmissionPages: jest.fn(),
}));

import { getCampaignSubmissionPages } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { getHomeHalloweenShelfItems } from "@/features/home/lib/home-halloween-shelf";

const mockPages = getCampaignSubmissionPages as jest.Mock;

function at(iso: string): number {
  return new Date(iso).getTime();
}

function item(n: number) {
  return { postId: `post-${n}`, authorName: `author-${n}`, thumbnailUrl: `https://img.test/${n}.webp` };
}

/** 6件ずつのページ(企画ページの一覧と同じ形)にして返す */
function pagesOf(count: number) {
  const items = Array.from({ length: count }, (_, index) => item(index + 1));
  const pages = [];
  for (let index = 0; index < items.length; index += 6) {
    pages.push(items.slice(index, index + 6));
  }
  return pages;
}

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("ホームの棚に並べる作品", () => {
  test("⭐期間中は、企画ページの一覧と同じ並びの先頭から12件", async () => {
    mockPages.mockResolvedValue(pagesOf(13));

    const items = await getHomeHalloweenShelfItems(at("2026-10-20T12:00:00+09:00"));

    expect(mockPages).toHaveBeenCalledWith("halloween-best-shot");
    expect(items.map((it) => it.postId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `post-${index + 1}`),
    );
  });

  test("12件より少なければ、あるだけ", async () => {
    mockPages.mockResolvedValue(pagesOf(4));

    const items = await getHomeHalloweenShelfItems(at("2026-10-20T12:00:00+09:00"));

    expect(items).toHaveLength(4);
  });

  test("始まる前(10/16 19:59:59)は読みに行かず、空", async () => {
    const items = await getHomeHalloweenShelfItems(at("2026-10-16T19:59:59+09:00"));

    expect(items).toEqual([]);
    expect(mockPages).not.toHaveBeenCalled();
  });

  test("始まった瞬間(10/16 20:00)から出す", async () => {
    mockPages.mockResolvedValue(pagesOf(1));

    const items = await getHomeHalloweenShelfItems(at("2026-10-16T20:00:00+09:00"));

    expect(items).toHaveLength(1);
  });

  test("終わり(11/1 0:00)からは読みに行かず、空。10/31 23:59:59 までは出す", async () => {
    mockPages.mockResolvedValue(pagesOf(1));

    expect(await getHomeHalloweenShelfItems(at("2026-10-31T23:59:59+09:00"))).toHaveLength(1);
    mockPages.mockClear();

    expect(await getHomeHalloweenShelfItems(at("2026-11-01T00:00:00+09:00"))).toEqual([]);
    expect(mockPages).not.toHaveBeenCalled();
  });

  test("読めなかったら空を返す(投げない)", async () => {
    mockPages.mockRejectedValue(new Error("db down"));

    await expect(getHomeHalloweenShelfItems(at("2026-10-20T12:00:00+09:00"))).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });
});

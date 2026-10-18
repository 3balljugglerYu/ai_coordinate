/** @jest-environment node */

/**
 * GET /api/hashtag-campaigns/[key]/targets(対象作品の投稿 ID)。
 *
 * 見る人によって変わらない公開の情報なので、未ログインでも返し、共有のキャッシュに載せる。
 * 形の違うキーは DB に問い合わせる前に 404。
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { getHashtagCampaignTargetsRoute } from "@/app/api/hashtag-campaigns/[key]/targets/handler";

describe("GET /api/hashtag-campaigns/[key]/targets", () => {
  test("対象作品の投稿 ID を返し、配信側で1分は使い回せるようにする", async () => {
    const fetchTargetPostIdsFn = jest.fn(async () => ["post-a", "post-b"]);
    const response = await getHashtagCampaignTargetsRoute("halloween-best-shot", {
      fetchTargetPostIdsFn,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ postIds: ["post-a", "post-b"] });
    expect(fetchTargetPostIdsFn).toHaveBeenCalledWith("halloween-best-shot");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=60",
    );
  });

  test("対象作品がまだ無ければ空の配列", async () => {
    const response = await getHashtagCampaignTargetsRoute("halloween-best-shot", {
      fetchTargetPostIdsFn: async () => [],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ postIds: [] });
  });

  test.each(["Halloween", "../etc", "a".repeat(65), ""])(
    "形の違うキー(%s)は DB に問い合わせずに 404",
    async (key) => {
      const fetchTargetPostIdsFn = jest.fn(async () => ["post-a"]);
      const response = await getHashtagCampaignTargetsRoute(key, { fetchTargetPostIdsFn });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        errorCode: "HASHTAG_CAMPAIGN_NOT_FOUND",
      });
      expect(fetchTargetPostIdsFn).not.toHaveBeenCalled();
    },
  );
});

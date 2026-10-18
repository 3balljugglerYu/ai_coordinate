/**
 * 対象作品(応募作)の投稿 ID の取得(2026-10-16 ユーザー指示: 対象作品にラベルと企画仕様のボタン)。
 *
 * - 企画ページの一覧と同じ list_hashtag_campaign_submissions を、RPC の上限(500件)で読む
 * - 一覧と同じキャッシュのタグに入れる(一覧と同じ時に新しくなる)
 * - 読めなければ空配列(ラベルが出ないだけ)
 */

const rpcMock = jest.fn();

jest.mock("next/cache", () => ({ cacheLife: jest.fn(), cacheTag: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

import { cacheLife, cacheTag } from "next/cache";
import {
  getHashtagCampaignTargetPostIds,
  TARGET_POST_ID_LIMIT,
} from "@/features/campaigns/hashtag-campaign/get-target-post-ids";
import { hashtagCampaignSubmissionsTag } from "@/features/campaigns/hashtag-campaign/get-submission-pages";

beforeEach(() => {
  rpcMock.mockReset();
  jest.mocked(cacheTag).mockClear();
  jest.mocked(cacheLife).mockClear();
});

describe("getHashtagCampaignTargetPostIds", () => {
  test("一覧と同じ RPC を、企画のキーと上限500件で呼び、投稿 ID を新しい順のまま返す", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { post_id: "post-new", author_id: "a1" },
        { post_id: "post-old", author_id: "a2" },
      ],
      error: null,
    });

    await expect(getHashtagCampaignTargetPostIds("halloween-best-shot")).resolves.toEqual([
      "post-new",
      "post-old",
    ]);
    expect(rpcMock).toHaveBeenCalledWith("list_hashtag_campaign_submissions", {
      p_campaign_key: "halloween-best-shot",
      p_limit: 500,
    });
    expect(TARGET_POST_ID_LIMIT).toBe(500);
  });

  test("企画ページの一覧と同じキャッシュのタグ・数分のキャッシュ", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await getHashtagCampaignTargetPostIds("halloween-best-shot");
    expect(cacheTag).toHaveBeenCalledWith(hashtagCampaignSubmissionsTag("halloween-best-shot"));
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  test("対象作品がまだ無ければ空配列", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(getHashtagCampaignTargetPostIds("halloween-best-shot")).resolves.toEqual([]);
  });

  test("読めなければ空配列(ラベルが出ないだけ)", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { code: "57014" } });
    await expect(getHashtagCampaignTargetPostIds("halloween-best-shot")).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

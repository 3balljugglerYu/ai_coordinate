import { connection, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { isHashtagCampaignKey } from "@/features/campaigns/hashtag-campaign/campaign-key";
import { getHashtagCampaignTargetPostIds } from "@/features/campaigns/hashtag-campaign/get-target-post-ids";

/**
 * GET /api/hashtag-campaigns/[key]/targets — 対象作品(応募作)の投稿 ID。
 *
 * 投稿の画像の左上のラベルと、企画仕様の「このカタログで生成する」に使う。
 * 企画ページの一覧に並ぶ作品と同じ(公開中で、ハッシュタグが付いたまま)。
 * 見る人によって変わらない公開の情報なので、未ログインでも返し、共有のキャッシュにも載せる。
 */

export type HashtagCampaignTargetsErrorCode = "HASHTAG_CAMPAIGN_NOT_FOUND";

export interface HashtagCampaignTargetsResponse {
  postIds: string[];
}

export interface HashtagCampaignTargetsRouteDependencies {
  /** 読めなければ空配列を返す(get-target-post-ids.ts) */
  fetchTargetPostIdsFn?: (campaignKey: string) => Promise<string[]>;
}

export async function getHashtagCampaignTargetsRoute(
  campaignKey: string,
  dependencies: HashtagCampaignTargetsRouteDependencies = {},
) {
  const fetchTargetPostIdsFn =
    dependencies.fetchTargetPostIdsFn ?? getHashtagCampaignTargetPostIds;

  if (!isHashtagCampaignKey(campaignKey)) {
    return jsonError("Not found", "HASHTAG_CAMPAIGN_NOT_FOUND", 404);
  }

  const body: HashtagCampaignTargetsResponse = {
    postIds: await fetchTargetPostIdsFn(campaignKey),
  };

  // サーバー側も数分のキャッシュなので、配信側でも1分は使い回す
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
  });
}

export const hashtagCampaignTargetsRouteHandlers = {
  async getHashtagCampaignTargetsRoute(campaignKey: string) {
    // リクエストごとに動かす(ビルド時に事前生成させない)
    await connection();
    return getHashtagCampaignTargetsRoute(campaignKey);
  },
};

import { revalidateTag } from "next/cache";

/**
 * 企画の対象作品(応募作)の一覧のキャッシュに、企画をまたいで付ける印。
 * 企画ページの一覧(get-submission-pages.ts)と対象作品の ID(get-target-post-ids.ts)の両方に付ける。
 */
export const HASHTAG_CAMPAIGN_SUBMISSIONS_ALL_TAG = "hashtag-campaign-submissions";

/**
 * 投稿・キャプションの編集・投稿の取り消しのあとに、対象作品の一覧をすぐ取り直させる。
 *
 * 2026-10-22 ユーザー指示: 投稿してすぐ「このカタログで生成する」をハロウィン仕様にしたい。
 * これまでは数分のキャッシュが切れるまで、投稿した作品が対象作品に入らなかった。
 * 投稿のたびにタグが付いたかを調べず、どの企画の分もまとめて失効させる
 * (一覧の取り直しは安く、投稿の数も多くない)。
 */
export function revalidateHashtagCampaignSubmissions(): void {
  revalidateTag(HASHTAG_CAMPAIGN_SUBMISSIONS_ALL_TAG, { expire: 0 });
}

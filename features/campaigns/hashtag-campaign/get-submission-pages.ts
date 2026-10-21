import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import { fetchAuthorNames } from "@/features/credits/lib/get-usable-prompt-showcase";
import { paginateOnePerAuthor } from "./paginate";
import { HASHTAG_CAMPAIGN_SUBMISSIONS_ALL_TAG } from "./revalidate-submissions";

/**
 * 企画ページの「キャンペーン対象の投稿」(2026-10-15 ユーザー決定)。
 *
 * - 対象: 応募作の記録(hashtag_campaign_submissions)のうち、いまも公開中で、
 *   いまもハッシュタグが付いている投稿(list_hashtag_campaign_submissions)
 * - 並び: 新しい順。6件ずつのページにし、1ページに同じ人は1件まで
 * - 見せ方はサムネイルだけ(作者名・利用回数は出さない。2026-10-15 ユーザー指示)。
 *   押すと /use-prompts と同じ確認を出してから投稿のページへ(確認に作者名を出す)
 *
 * 「使えるか」は投稿詳細と同じ validate_derived_prompt_sources で確かめる
 * (判定を書き写さない。理由は get-usable-prompt-showcase.ts)。
 *
 * **読めなければ空配列。** 呼び出し側は区画ごと出さない(応募作がまだないときも同じ)。
 */

/** 企画ページに出す1件。 */
export interface CampaignSubmissionItem {
  /** 応募作の投稿 ID。`/posts/{id}` へのリンクになる。 */
  postId: string;
  thumbnailUrl: string;
  /** 読み上げ用の説明(alt)と、押したときの確認に使う */
  authorName: string;
}

/** 1ページの件数(3列 × 2段)。 */
export const SUBMISSION_PAGE_SIZE = 6;

/**
 * 取り出す上限(新しいほうから)。使えるかの確認(RPC)は1件ずつ回るので、
 * DB の仕事が増えすぎないところで止める。キャッシュは数分なので、この数を
 * 数分に1回確かめる計算になる。
 */
const CANDIDATE_LIMIT = 120;

export function hashtagCampaignSubmissionsTag(campaignKey: string): string {
  return `hashtag-campaign-submissions-${campaignKey}`;
}

type SubmissionRow = {
  post_id: string;
  author_id: string;
  storage_path_thumb: string | null;
  storage_path: string | null;
  image_url: string | null;
};

export async function getCampaignSubmissionPages(
  campaignKey: string,
): Promise<CampaignSubmissionItem[][]> {
  "use cache";
  cacheTag(hashtagCampaignSubmissionsTag(campaignKey), HASHTAG_CAMPAIGN_SUBMISSIONS_ALL_TAG);
  cacheLife("minutes");

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("list_hashtag_campaign_submissions", {
    p_campaign_key: campaignKey,
    p_limit: CANDIDATE_LIMIT,
  });
  if (error) {
    console.error("Failed to list hashtag campaign submissions", { code: error.code });
    return [];
  }

  const rows = (data ?? []) as SubmissionRow[];
  if (rows.length === 0) {
    return [];
  }

  /*
    RPC は2つの配列を添字で対応させる。requester に作者本人を渡すと、
    見る人によって変わる条件(フォロー)だけが外れ、作品そのものが使えるかが残る
    (get-usable-prompt-showcase.ts と同じ使い方)。
  */
  const { data: availabilities, error: availabilityError } = await supabase.rpc(
    "validate_derived_prompt_sources",
    {
      p_source_post_ids: rows.map((row) => row.post_id),
      p_requester_ids: rows.map((row) => row.author_id),
    },
  );
  if (availabilityError) {
    console.error("Failed to validate hashtag campaign submissions", {
      code: availabilityError.code,
    });
    return [];
  }

  const availableIds = new Set(
    ((availabilities ?? []) as { source_post_id: string; is_available: boolean | null }[])
      .filter((row) => row.is_available === true)
      .map((row) => row.source_post_id),
  );
  const usable = rows.filter((row) => availableIds.has(row.post_id));
  if (usable.length === 0) {
    return [];
  }

  const names = await fetchAuthorNames(
    supabase,
    usable.map((row) => row.author_id),
  );

  const items = usable.flatMap((row) => {
    const thumbnailUrl = getPostThumbUrl(row);
    // サムネイルが解決できない投稿は出さない(壊れた画像の枠を見せない)
    if (!thumbnailUrl) {
      return [];
    }
    return [
      {
        authorId: row.author_id,
        item: {
          postId: row.post_id,
          thumbnailUrl,
          authorName: names.get(row.author_id) ?? "匿名ユーザー",
        },
      },
    ];
  });

  return paginateOnePerAuthor(items, SUBMISSION_PAGE_SIZE).map((page) =>
    page.map((entry) => entry.item),
  );
}

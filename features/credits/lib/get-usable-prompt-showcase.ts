import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPostBeforeImageUrl,
  getPostThumbUrl,
} from "@/features/posts/lib/utils";
import { shouldShowUsageCount } from "@/features/posts/lib/constants";

/**
 * `/use-prompts` の「フォローすると使えるプロンプト」に出す実データ。
 *
 * ## なぜイラストではなく実物を出すのか
 *
 * イラストは「そういう機能がある」までしか運ばない。実際に投稿されている
 * 作品のサムネイルは「この人のを使ってみたい」まで運ぶ。使う人が7人しか
 * いない(2026-08-21)状況で足りないのは説明ではなく、きっかけの方。
 *
 * ## 可否判定を書き写さないこと(ADR-006)
 *
 * 「使えるか」は `validate_derived_prompt_sources` が正本。ここで
 * `moderation_status` や秘匿行の有無を TypeScript 側に写すと、投稿詳細と
 * 判定がずれて「ページには出るのに詳細では使えない」が起きる。
 *
 * requester(閲覧者)は決まらない — 未ログインでも見えるページで、
 * フォロー有無は人によって違うため。そこで既存の一覧解決と同じ手を使い、
 * **requester に原作者自身の ID を渡す**。この関数のフォロー条件は
 * 「フォロー済み または 本人」、ブロックは双方向検査なので、
 * requester = 原作者にすると閲覧者依存の条件だけが外れ、内在的な可否
 * (実在・投稿済み・visible・free・root・secret あり・作者が利用可)が残る。
 *
 * だから見出しは「使えます」ではなく **「フォローすると使えます」** にする。
 *
 * ## Before / After が載っているものだけ
 *
 * このページが伝えたいのは「**うちの子が変わる**」こと。After だけの作品を
 * 並べると、ただの画像置き場に見えて、何が起きるのかが運ばれない。
 *
 * 判定は書き写さず `getPostBeforeImageUrl`(フィードと同じ) を通す。条件を
 * TypeScript 側に写すと、フィードでは Before が出ているのにここでは落ちる
 * (あるいはその逆)というズレが静かに入る。
 *
 * ⭐ この条件はページ本文の注意書きと**対になっている**。
 * (「Free Style で投稿された作品のうち、Before / After が載っているものを
 * 新しい順に」) 条件を変えるときは、あちらの文も必ず直すこと。
 * 運営が見繕っているように見えると、投稿者は「勝手に使われている」と
 * 受け取る。並び順の根拠を書けるのは、機械的な条件であるうちだけ。
 */

/** ページに出す1件。 */
export interface UsablePromptShowcaseItem {
  /** 原作の投稿 ID。`/posts/{id}` へのリンクになる。 */
  postId: string;
  thumbnailUrl: string;
  authorName: string;
  /**
   * 利用回数。**閾値未満は null**(`shouldShowUsageCount`)。
   * 少ない数字は社会的証明として働かず、逆の証明になるため出さない。
   */
  usageCount: number | null;
}

/** ページに並べる最大件数。3列 × 2段。 */
const SHOWCASE_LIMIT = 6;

/**
 * 候補の取得件数。Before の有無と可否判定で落ちるぶんを見込んで多めに取る。
 * 全件が落ちても「セクションごと出さない」に倒れるだけで、ページは壊れない。
 */
const CANDIDATE_LIMIT = 60;

/**
 * 可否判定(RPC)へ渡す上限。
 *
 * RPC は1件ずつ LATERAL で回るので、入力を増やすとそのぶん DB 側の仕事が
 * 増える。**Before の絞り込みを先に済ませてから**ここまで削り、RPC の負荷は
 * 元のままに保つ。
 */
const VALIDATION_LIMIT = 24;

type CandidateRow = {
  id: string;
  user_id: string | null;
  storage_path_thumb: string | null;
  storage_path: string | null;
  image_url: string | null;
  /* Before の有無を見るための列。判定自体は getPostBeforeImageUrl に任せる */
  pre_generation_storage_path: string | null;
  show_before_image: boolean | null;
};

/**
 * 「フォローすると使えるプロンプト」を新しい順に取得する。
 *
 * **読めなければ空配列(fail closed)。** 呼び出し側はセクションごと出さない。
 * 空の枠を見せるより、無い方がよい。
 */
export async function getUsablePromptShowcase(): Promise<
  UsablePromptShowcaseItem[]
> {
  const supabase = createAdminClient();

  const { data: candidates, error: candidateError } = await supabase
    .from("generated_images")
    .select(
      "id, user_id, storage_path_thumb, storage_path, image_url, pre_generation_storage_path, show_before_image"
    )
    .eq("generation_type", "free")
    .eq("is_posted", true)
    .eq("moderation_status", "visible")
    // root の投稿だけ。派生投稿を出すと原作をたどる階層が増えて分かりにくい
    .is("source_post_id", null)
    .not("user_id", "is", null)
    .order("posted_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (candidateError || !candidates || candidates.length === 0) {
    if (candidateError) {
      console.error("Failed to fetch usable prompt candidates", {
        code: candidateError.code,
      });
    }
    return [];
  }

  const rows = (candidates as CandidateRow[])
    .filter(
      (row): row is CandidateRow & { user_id: string } => Boolean(row.user_id)
    )
    /*
      Before が出ない作品は落とす。判定はフィードと同じ関数に任せる
      (列の条件をここへ書き写すと、表示と食い違っても気づけない)。
    */
    .filter((row) =>
      Boolean(
        getPostBeforeImageUrl({
          pre_generation_storage_path: row.pre_generation_storage_path,
          show_before_image: row.show_before_image ?? true,
        })
      )
    )
    // RPC の入力はここで抑える(上の絞り込みを通ったものだけを渡す)
    .slice(0, VALIDATION_LIMIT);
  if (rows.length === 0) {
    return [];
  }

  /*
    RPC は2つの配列を添字で対応させる。長さが違うと例外になるので、
    ここで順序を崩さないこと。
  */
  const { data: availabilities, error: availabilityError } = await supabase.rpc(
    "validate_derived_prompt_sources",
    {
      p_source_post_ids: rows.map((row) => row.id),
      p_requester_ids: rows.map((row) => row.user_id),
    }
  );

  if (availabilityError) {
    console.error("Failed to validate usable prompt candidates", {
      code: availabilityError.code,
    });
    return [];
  }

  const availableIds = new Set(
    ((availabilities ?? []) as {
      source_post_id: string;
      is_available: boolean | null;
    }[])
      .filter((row) => row.is_available === true)
      .map((row) => row.source_post_id)
  );

  const usable = rows
    .filter((row) => availableIds.has(row.id))
    .slice(0, SHOWCASE_LIMIT);

  if (usable.length === 0) {
    return [];
  }

  const [profiles, usageCounts] = await Promise.all([
    fetchAuthorNames(
      supabase,
      usable.map((row) => row.user_id)
    ),
    fetchUsageCounts(
      supabase,
      usable.map((row) => row.id)
    ),
  ]);

  return usable.flatMap((row) => {
    const thumbnailUrl = getPostThumbUrl(row);
    // サムネイルが解決できない行は出さない(壊れた画像枠を見せない)
    if (!thumbnailUrl) {
      return [];
    }
    const count = usageCounts.get(row.id) ?? 0;
    return [
      {
        postId: row.id,
        thumbnailUrl,
        authorName: profiles.get(row.user_id) ?? "匿名ユーザー",
        usageCount: shouldShowUsageCount(count) ? count : null,
      },
    ];
  });
}

/** 作者名。読めなければ空(呼び出し側で既定名に倒れる)。 */
async function fetchAuthorNames(
  supabase: ReturnType<typeof createAdminClient>,
  authorIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(authorIds));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, nickname")
    .in("user_id", uniqueIds);

  if (error) {
    console.error("Failed to fetch showcase author names", {
      code: error.code,
    });
    return new Map();
  }

  const names = new Map<string, string>();
  for (const row of (data ?? []) as {
    user_id: string;
    nickname: string | null;
  }[]) {
    if (row.nickname) {
      names.set(row.user_id, row.nickname);
    }
  }
  return names;
}

/**
 * 利用回数。数え方の正本は `get_prompt_usage_counts`(投稿詳細と同じ)。
 * 集計 SQL を書き写すと、詳細と一覧で数字が食い違う。
 */
async function fetchUsageCounts(
  supabase: ReturnType<typeof createAdminClient>,
  originPostIds: string[]
): Promise<Map<string, number>> {
  if (originPostIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc("get_prompt_usage_counts", {
    p_origin_post_ids: originPostIds,
  });

  if (error) {
    console.error("Failed to fetch showcase usage counts", {
      code: error.code,
    });
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as {
    origin_post_id: string;
    usage_count: number | null;
  }[]) {
    const count = Number(row.usage_count);
    counts.set(
      row.origin_post_id,
      Number.isSafeInteger(count) && count > 0 ? count : 0
    );
  }
  return counts;
}

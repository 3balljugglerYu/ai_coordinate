import type { SupabaseClient } from "@supabase/supabase-js";
import type { PromptActionSummary, SourcePromptReference } from "../types";
import { getPostBeforeImageUrl, getPostThumbUrl } from "./utils";

/**
 * プロンプト非公開投稿・派生投稿の参照カードを解決する（REQ-013 / REQ-014）。
 *
 * ## 「原作」の決め方
 *
 * - 派生投稿 (`source_post_id != null`) → その値が指す root 投稿
 * - root の非公開投稿 → その投稿自身
 *
 * どちらも同じカードで表示する。root の非公開投稿では原作者＝投稿者になる。
 *
 * ## 閲覧者に依存しない判定だけを返す理由
 *
 * フォロー有無とブロックは閲覧者ごとに変わり、`use cache` の粒度と噛み合わない。
 * また、フォロー直後に反映されないカードは操作の手応えを損なう。
 * そこで
 *
 * - ここでは「原作が内在的に使えるか」（実在・投稿済み・visible・free・root・
 *   非公開・secret あり・作者のアカウント利用可）だけを判定する
 * - フォロー有無は画面側が既に取得している follow-status を使う
 * - 最終的な認可は生成API・Worker・完了RPCが再検証する
 *
 * ## 内在的な可否をどう取るか
 *
 * `validate_derived_prompt_source(origin, requester)` へ**原作者自身の ID**を渡す。
 * この関数のフォロー条件は「フォロー済み または 本人」で、ブロックは双方向の
 * 検査なので、requester = 原作者にすると閲覧者依存の条件が自動的に外れ、
 * 内在的な可否だけが残る。判定を TypeScript 側へ写して二重管理にしない。
 */

interface OriginResolvableRecord {
  id?: string;
  user_id: string | null;
  generation_type?: string | null;
  prompt_visibility?: "public" | "private";
  source_post_id?: string | null;
  source_author_id?: string | null;
}

type OriginRow = {
  id: string;
  user_id: string | null;
  prompt_visibility: "public" | "private" | null;
  storage_path_thumb: string | null;
  storage_path: string | null;
  image_url: string | null;
  width: number | null;
  height: number | null;
  pre_generation_storage_path: string | null;
  show_before_image: boolean | null;
};

/**
 * 参照カードを出すべき投稿かを判定し、原作の投稿 ID を返す。
 * カード不要なら null。
 *
 * 条件は `getPostPromptDisplayMode` が `source_reference` を返す条件と
 * 一致させること。片方だけを変えると、カードを出すと決めたのに中身が
 * 解決できず、プロンプト欄ごと何も表示されなくなる（実際に起きた）。
 * `tests/unit/features/posts/source-prompt-reference.test.ts` の
 * 「表示モードとの整合」がこの一致を機械的に検査する。
 *
 * `prompt_visibility` は条件に入れない。公開・非公開のどちらでもカードを出す。
 */
export function resolveOriginPostId(
  record: OriginResolvableRecord
): string | null {
  if (record.source_post_id) {
    return record.source_post_id;
  }
  if (record.generation_type === "free" && record.id) {
    return record.id;
  }
  return null;
}

/**
 * 参照カードの内容を解決する。
 *
 * @param supabase service role のクライアント。原作が非公開・未投稿へ変わっていても
 *                 「利用不可」を判定するために行の存在を確認する必要があるため、
 *                 閲覧者の RLS ではなく service role で読む。返す値は
 *                 可否・クレジット・サムネイル・利用数だけで、本文は含まない。
 */
export async function resolveSourcePromptReference(
  record: OriginResolvableRecord,
  supabase: SupabaseClient
): Promise<SourcePromptReference | null> {
  const originPostId = resolveOriginPostId(record);
  if (!originPostId) {
    return null;
  }

  // 原作者。派生投稿は削除後もクレジットを出せるようスナップショットを使う。
  // root の非公開投稿では投稿者自身が原作者になる。
  const originAuthorId = record.source_author_id ?? record.user_id ?? null;

  if (!originAuthorId) {
    // 原作者が分からない状態ではフォロー先もクレジットも出せない。
    // 系譜だけ残して利用不可にする。
    return {
      postId: originPostId,
      isAvailable: false,
      authorId: null,
      authorNickname: null,
      authorAvatarUrl: null,
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
      beforeThumbnailUrl: null,
      // 原作を読めていないので、開示側へ倒さない
      promptVisibility: "private",
      usageCount: 0,
    };
  }

  const [validation, profile, usageCount] = await Promise.all([
    fetchIntrinsicAvailability(supabase, originPostId, originAuthorId),
    fetchAuthorProfile(supabase, originAuthorId),
    fetchUsageCount(supabase, originPostId),
  ]);

  const base: SourcePromptReference = {
    postId: originPostId,
    isAvailable: validation,
    authorId: originAuthorId,
    authorNickname: profile.nickname,
    authorAvatarUrl: profile.avatarUrl,
    thumbnailUrl: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    beforeThumbnailUrl: null,
    // 利用不可のときはコピーもさせないので、開示側へ倒さない
    promptVisibility: "private",
    usageCount,
  };

  if (!validation) {
    // 利用不可のときはサムネイルを含めない（REQ-014）。
    // 形状は同じままにして、原因を推測させない。
    return base;
  }

  const thumbnail = await fetchOriginThumbnail(supabase, originPostId);
  return {
    ...base,
    thumbnailUrl: thumbnail.url,
    thumbnailWidth: thumbnail.width,
    thumbnailHeight: thumbnail.height,
    beforeThumbnailUrl: thumbnail.beforeUrl,
    promptVisibility: thumbnail.promptVisibility,
  };
}

/**
 * 一覧（フィード）用に、複数投稿ぶんの CTA サマリをまとめて解決する（ADR-005）。
 *
 * 詳細画面と同じ `resolveSourcePromptReference` を通してから本文につながる値を
 * 落とす。一覧側で秘匿条件を再実装しないのは、詳細と判定がずれて
 * 「詳細では出ない導線が一覧に出る」事故を防ぐためである。
 *
 * 同じ原作を指す派生投稿が並ぶことがあるので、原作単位で重複を除いてから解決する。
 *
 * @param records 一覧の投稿（`id` を必須にする。戻り値のキーになるため）
 * @param supabase service role のクライアント（詳細と同じ経路）
 * @returns 投稿 ID → サマリ。CTA を出さない投稿は含めない
 */
export async function resolveSourcePromptSummaries(
  records: (OriginResolvableRecord & { id: string })[],
  supabase: SupabaseClient
): Promise<Record<string, PromptActionSummary>> {
  // 原作単位に畳む。キーは原作 ID と原作者 ID の組（原作者はレコード由来のため）。
  const byOrigin = new Map<
    string,
    { record: OriginResolvableRecord; postIds: string[] }
  >();

  for (const record of records) {
    const originPostId = resolveOriginPostId(record);
    if (!originPostId) {
      continue;
    }
    const originAuthorId = record.source_author_id ?? record.user_id ?? "";
    const key = `${originPostId}::${originAuthorId}`;
    const existing = byOrigin.get(key);
    if (existing) {
      existing.postIds.push(record.id);
      continue;
    }
    byOrigin.set(key, { record, postIds: [record.id] });
  }

  if (byOrigin.size === 0) {
    return {};
  }

  const resolved = await Promise.all(
    Array.from(byOrigin.values()).map(async ({ record, postIds }) => ({
      postIds,
      reference: await resolveSourcePromptReference(record, supabase),
    }))
  );

  const summaries: Record<string, PromptActionSummary> = {};
  for (const { postIds, reference } of resolved) {
    if (!reference) {
      continue;
    }
    const summary = toPromptActionSummary(reference);
    for (const postId of postIds) {
      summaries[postId] = summary;
    }
  }
  return summaries;
}

/**
 * 参照カード用の値から、一覧に載せてよい項目だけを取り出す。
 *
 * サムネイルとアバターは落とす。フィードのカードは投稿自身の Before/After を
 * 出すため使い道が無く、payload を太らせるだけである。
 * 本文はそもそも `SourcePromptReference` に含まれない（PROMPT-SECRECY-001）。
 */
export function toPromptActionSummary(
  reference: SourcePromptReference
): PromptActionSummary {
  return {
    originPostId: reference.postId,
    isAvailable: reference.isAvailable,
    originAuthorId: reference.authorId,
    originAuthorNickname: reference.authorNickname,
    usageCount: reference.usageCount,
    promptVisibility: reference.promptVisibility,
  };
}

/**
 * 原作が内在的に使えるか。閲覧者依存の条件は requester=原作者で外している。
 *
 * 判定できないときは false（fail closed）。カードを無効化するだけなので、
 * 誤って有効化して生成APIで弾かれるより、そもそも押させない方が親切である。
 */
async function fetchIntrinsicAvailability(
  supabase: SupabaseClient,
  originPostId: string,
  originAuthorId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc("validate_derived_prompt_source", {
      p_source_post_id: originPostId,
      p_requester_id: originAuthorId,
    })
    .select("is_available")
    .maybeSingle();

  if (error) {
    console.error("Failed to validate source prompt availability", {
      code: error.code,
    });
    return false;
  }

  return Boolean((data as { is_available?: boolean } | null)?.is_available);
}

async function fetchAuthorProfile(
  supabase: SupabaseClient,
  authorId: string
): Promise<{ nickname: string | null; avatarUrl: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("user_id", authorId)
    .maybeSingle();

  if (error || !data) {
    return { nickname: null, avatarUrl: null };
  }

  const typed = data as { nickname: string | null; avatar_url: string | null };
  return { nickname: typed.nickname, avatarUrl: typed.avatar_url };
}

/**
 * 利用数。取得できないときは 0 にする。
 *
 * カードの本質は「このプロンプトで作れる」ことなので、人数が出ないだけで
 * カード全体を落とさない。
 */
async function fetchUsageCount(
  supabase: SupabaseClient,
  originPostId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("get_prompt_usage_count", {
    p_origin_post_id: originPostId,
  });

  if (error) {
    console.error("Failed to fetch prompt usage count", { code: error.code });
    return 0;
  }

  const count = Number(data);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/**
 * 原作のサムネイル URL・実寸・生成元画像 URL。
 *
 * 実寸はカードのアスペクト比に使う。lazy compute でまだ埋まっていない行が
 * あるため null を返し得る（描画側が既定比率へフォールバックする）。
 *
 * Before の解決は `getPostBeforeImageUrl` に委ねる。この関数は
 * `show_before_image === false` で null を返すため、原作者が「生成前の画像も
 * 表示する」を外している設定がそのまま尊重される。
 *
 * `input_image_url_fallback` は渡さない。あのフォールバックは「自分の生成直後の
 * 投稿」向けで、ここでの原作は他人の投稿である。他人のジョブ行を引くクエリと
 * URL 許可リスト検査が増える割に、得られるのは永続化待ちの数十秒だけ。
 */
async function fetchOriginThumbnail(
  supabase: SupabaseClient,
  originPostId: string
): Promise<{
  url: string | null;
  width: number | null;
  height: number | null;
  beforeUrl: string | null;
  promptVisibility: "public" | "private";
}> {
  const { data, error } = await supabase
    .from("generated_images")
    .select(
      "id, user_id, prompt_visibility, storage_path_thumb, storage_path, image_url, width, height, pre_generation_storage_path, show_before_image"
    )
    .eq("id", originPostId)
    .maybeSingle();

  if (error || !data) {
    // 読めなければ開示側へ倒さない
    return {
      url: null,
      width: null,
      height: null,
      beforeUrl: null,
      promptVisibility: "private",
    };
  }

  const row = data as OriginRow;
  const url = getPostThumbUrl(row);
  const beforeUrl = getPostBeforeImageUrl({
    pre_generation_storage_path: row.pre_generation_storage_path,
    show_before_image: row.show_before_image ?? undefined,
  });

  return {
    url: url || null,
    width: row.width ?? null,
    height: row.height ?? null,
    beforeUrl,
    // 想定外の値は非公開として扱う（fail closed）
    promptVisibility: row.prompt_visibility === "public" ? "public" : "private",
  };
}

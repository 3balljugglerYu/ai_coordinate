/**
 * 投稿検索のフィルタ組み立て。
 *
 * 検索対象は「作品説明(caption)」と「作者の公開表示名(profiles.nickname)」。
 * 以前は generated_images.prompt を対象にしていたが、プロンプトは
 * 公開行から秘匿テーブルへ移すため検索キーには使えない。
 * 詳細は docs/planning/free-prompt-private-mode-implementation-plan.md ADR-007。
 *
 * PostgREST の挙動として、同じクエリに `or=` を複数付けると AND で結合される。
 * 本番実測: 全920件 → caption有り531件 → さらに coordinate 限定で159件。
 * このため既存の可視性フィルタ用 or とは独立に検索用 or を足してよい。
 */

import { extractHashtags } from "@/lib/hashtag";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

/** 検索クエリの最大長。既存のバリデーションと揃える。 */
export const MAX_SEARCH_QUERY_LENGTH = 100;

/** nickname 一致で拾う作者の上限。PostgREST の URL 長を無制限に伸ばさないため。 */
export const MAX_MATCHED_AUTHORS = 50;

/**
 * LIKE / ILIKE のワイルドカードを無効化する。
 *
 * これを行わないと `%` だけの検索が全件にヒットし、`_` が任意の1文字に
 * マッチしてしまう。PostgreSQL の既定エスケープ文字は `\` なので、
 * `\` 自身も先にエスケープする。
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (matched) => `\\${matched}`);
}

/**
 * PostgREST の `or=(...)` に埋め込む値をクォートする。
 *
 * `,` `.` `(` `)` はフィルタ構文の区切りとして解釈されるため、
 * 二重引用符で囲む。値に含まれる `"` と `\` はバックスラッシュで退避する。
 */
function quoteFilterValue(value: string): string {
  const escaped = value.replace(/(["\\])/g, "\\$1");
  return `"${escaped}"`;
}

/**
 * 検索用の or フィルタ文字列を組み立てる。
 *
 * - 検索語が空なら undefined（= 絞り込まない）
 * - 作者が1人もヒットしなければ caption だけを対象にする
 * - 作者がヒットすれば caption または該当作者の投稿を対象にする
 */
export function buildPostSearchOrFilter(
  searchQuery: string | undefined,
  matchedAuthorIds: readonly string[] = []
): string | undefined {
  const trimmed = searchQuery?.trim();
  if (!trimmed) {
    return undefined;
  }

  const pattern = quoteFilterValue(`%${escapeLikePattern(trimmed)}%`);
  const conditions = [`caption.ilike.${pattern}`];

  const uniqueAuthorIds = Array.from(new Set(matchedAuthorIds)).slice(
    0,
    MAX_MATCHED_AUTHORS
  );
  if (uniqueAuthorIds.length > 0) {
    conditions.push(`user_id.in.(${uniqueAuthorIds.join(",")})`);
  }

  return conditions.join(",");
}

/**
 * nickname 検索用の ILIKE パターン。
 *
 * `.ilike()` は or 構文を通らないためクォートは不要で、
 * ワイルドカードの無効化だけを行う。
 */
export function buildAuthorNicknamePattern(searchQuery: string): string {
  return `%${escapeLikePattern(searchQuery.trim())}%`;
}

/**
 * 検索クエリの種別。X と同じく入力欄は 1 つで、書き方で行き先が変わる。
 *
 * `#冬服` … タグ完全一致（`hashtags.name_normalized`）
 * それ以外 … 従来のフリーワード（caption + 作者名）
 *
 * `#123` のようにタグとして成立しない書き方はフリーワードに倒す。
 * 「タグが無いので 0 件」より「そのまま探す」方が、押した人の期待に近い。
 */
export type ParsedSearchQuery =
  | { kind: "hashtag"; normalized: string }
  | { kind: "freeText"; query: string };

export function parseSearchQuery(searchQuery: string): ParsedSearchQuery {
  const trimmed = searchQuery.trim();

  if (/^[#＃]/.test(trimmed)) {
    // 抽出規則は lib/hashtag が正本。ここで書き分けるとリンクと検索がズレる
    const [tag] = extractHashtags(trimmed);
    if (tag && `#${tag.name}` === trimmed.replace(/^＃/, "#")) {
      return { kind: "hashtag", normalized: tag.normalized };
    }
  }

  return { kind: "freeText", query: trimmed };
}

/**
 * タグ検索の内部結合を付けた select 句。
 * 付けたときは行に `post_hashtags` が混ざるので、後段へ渡す前に落とす。
 */
export function buildPostSelect(hashtagId: string | null): string {
  return hashtagId ? "*, post_hashtags!inner(hashtag_id)" : "*";
}

/**
 * 内部結合で付いてきた埋め込み列を落とし、同一投稿の重複行を畳む。
 *
 * select 句を実行時に組み立てるため supabase-js は行の型を解決できない。
 * 型の付け直しはこの 1 箇所に閉じる。
 */
export function stripHashtagJoin(rows: unknown): GeneratedImageRecord[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const result: GeneratedImageRecord[] = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    const rest = { ...row };
    delete rest.post_hashtags;
    const id = String(rest.id ?? "");
    // 将来 source 違いの行が増えると、同じ投稿が複数行で返りうる
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    result.push(rest as unknown as GeneratedImageRecord);
  }

  return result;
}

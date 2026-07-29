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

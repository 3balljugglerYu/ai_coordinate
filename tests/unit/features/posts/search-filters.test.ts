/** @jest-environment node */

/**
 * 投稿検索フィルタのテスト。
 *
 * 検索対象を prompt から caption + 作者表示名へ差し替えたことに伴う実装。
 * プロンプトは秘匿テーブルへ移すため検索キーにできない（ADR-007）。
 *
 * ワイルドカードのエスケープは機能要件ではなく防御。既存実装は
 * `%${query}%` を素で渡していたため、`%` だけの検索が全件にヒットしていた。
 */

import {
  MAX_MATCHED_AUTHORS,
  buildAuthorNicknamePattern,
  buildPostSearchOrFilter,
  escapeLikePattern,
} from "@/features/posts/lib/search-filters";

describe("escapeLikePattern", () => {
  it("ワイルドカードを無効化する", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("バックスラッシュ自身も退避する", () => {
    // 先に `\` を処理しないと、後続のエスケープ結果を壊す
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("通常の文字は変えない", () => {
    expect(escapeLikePattern("ワンピース")).toBe("ワンピース");
  });
});

describe("buildPostSearchOrFilter", () => {
  it("検索語が無ければ絞り込まない", () => {
    expect(buildPostSearchOrFilter(undefined)).toBeUndefined();
    expect(buildPostSearchOrFilter("")).toBeUndefined();
    expect(buildPostSearchOrFilter("   ")).toBeUndefined();
  });

  it("作者がヒットしなければ caption だけを対象にする", () => {
    expect(buildPostSearchOrFilter("ワンピース")).toBe(
      'caption.ilike."%ワンピース%"'
    );
  });

  it("作者がヒットすれば caption か該当作者の投稿を対象にする", () => {
    const filter = buildPostSearchOrFilter("ゆう", ["user-1", "user-2"]);

    expect(filter).toBe(
      'caption.ilike."%ゆう%",user_id.in.(user-1,user-2)'
    );
  });

  it("作者IDを重複排除する", () => {
    const filter = buildPostSearchOrFilter("ゆう", ["user-1", "user-1"]);

    expect(filter).toContain("user_id.in.(user-1)");
  });

  it("作者IDの件数を上限で打ち切る", () => {
    // URL 長が無制限に伸びないようにする
    const many = Array.from({ length: MAX_MATCHED_AUTHORS + 10 }, (_, i) => `u${i}`);
    const filter = buildPostSearchOrFilter("あ", many) ?? "";

    const inList = filter.slice(filter.indexOf("user_id.in.("));
    expect(inList.split(",").length).toBe(MAX_MATCHED_AUTHORS);
  });

  it("ワイルドカードが全件ヒットにならない", () => {
    // エスケープは2層必要。
    //   1層目: ILIKE のワイルドカード無効化      `%`  -> `\%`
    //   2層目: PostgREST のクォート内エスケープ  `\`  -> `\\`
    // 結果として送出されるのは `%\\%%` で、PostgREST が1層剥がして
    // ILIKE には `%\%%`（= リテラルの % を含む）が渡る。
    //
    // 本番実測:
    //   or=(caption.ilike."%%%")   -> 531件（caption 全件。素で渡していた頃の挙動）
    //   or=(caption.ilike."%\\%%") -> 0件（リテラル % を含む投稿のみ）
    expect(buildPostSearchOrFilter("%")).toBe('caption.ilike."%\\\\%%"');
  });

  it("フィルタ構文の区切り文字を含む検索語を壊さない", () => {
    // `,` や `)` は or 構文の区切りとして解釈されるため引用符で囲む
    const filter = buildPostSearchOrFilter("a,b)c");

    expect(filter).toBe('caption.ilike."%a,b)c%"');
  });

  it("引用符を含む検索語を退避する", () => {
    const filter = buildPostSearchOrFilter('say "hi"');

    expect(filter).toBe('caption.ilike."%say \\"hi\\"%"');
  });

  it("prompt を検索対象にしない", () => {
    const filter = buildPostSearchOrFilter("なにか", ["user-1"]) ?? "";

    expect(filter).not.toContain("prompt");
  });
});

describe("buildAuthorNicknamePattern", () => {
  it("前後にワイルドカードを付ける", () => {
    expect(buildAuthorNicknamePattern("ゆう")).toBe("%ゆう%");
  });

  it("検索語のワイルドカードは無効化する", () => {
    expect(buildAuthorNicknamePattern("%")).toBe("%\\%%");
  });

  it("前後の空白を落とす", () => {
    expect(buildAuthorNicknamePattern("  ゆう  ")).toBe("%ゆう%");
  });
});

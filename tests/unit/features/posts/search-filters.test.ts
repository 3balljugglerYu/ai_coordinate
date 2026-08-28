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
  buildPostSelect,
  escapeLikePattern,
  parseSearchQuery,
  stripHashtagJoin,
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

/**
 * 入力欄は 1 つ。書き方で行き先が変わる（X と同じ）。
 */
describe("parseSearchQuery", () => {
  test("#で始まればタグ検索。キーは正規化して返す", () => {
    expect(parseSearchQuery("#冬服")).toEqual({
      kind: "hashtag",
      normalized: "冬服",
    });
    expect(parseSearchQuery("#AI")).toEqual({
      kind: "hashtag",
      normalized: "ai",
    });
  });

  test("全角 ＃ でもタグ検索になる", () => {
    expect(parseSearchQuery("＃冬服")).toEqual({
      kind: "hashtag",
      normalized: "冬服",
    });
  });

  test("前後の空白は落とす", () => {
    expect(parseSearchQuery("  #冬服  ")).toEqual({
      kind: "hashtag",
      normalized: "冬服",
    });
  });

  test("タグの後ろに文字が続く場合はフリーワード扱い", () => {
    // 「#冬服 かわいい」はタグ完全一致ではない。そのまま探す方が期待に近い
    expect(parseSearchQuery("#冬服 かわいい")).toEqual({
      kind: "freeText",
      query: "#冬服 かわいい",
    });
  });

  test("タグとして成立しない書き方はフリーワードに倒す", () => {
    expect(parseSearchQuery("#123")).toEqual({
      kind: "freeText",
      query: "#123",
    });
    expect(parseSearchQuery("#")).toEqual({ kind: "freeText", query: "#" });
    expect(parseSearchQuery("#冬服#みきふく")).toEqual({
      kind: "freeText",
      query: "#冬服#みきふく",
    });
  });

  test("#で始まらなければ従来どおりフリーワード", () => {
    expect(parseSearchQuery("冬服")).toEqual({
      kind: "freeText",
      query: "冬服",
    });
  });
});

describe("タグ検索のクエリ整形", () => {
  test("タグ指定がなければ select は従来どおり", () => {
    expect(buildPostSelect(null)).toBe("*");
  });

  test("タグ指定があれば内部結合で絞る（post_id を先取りしない）", () => {
    // 先に post_id を集めて上限で切ると、51件目以降がページングしても出なくなる
    expect(buildPostSelect("tag-1")).toBe("*, post_hashtags!inner(hashtag_id)");
  });

  test("結合で付いた埋め込み列を落とす", () => {
    const rows = [
      { id: "p1", caption: "a", post_hashtags: [{ hashtag_id: "t1" }] },
    ];

    expect(stripHashtagJoin(rows)).toEqual([{ id: "p1", caption: "a" }]);
  });

  test("同じ投稿が複数行で返っても1件に畳む", () => {
    // 将来 source 違い（自動タグ）の行が増えると起こりうる
    const rows = [
      { id: "p1", post_hashtags: [{ hashtag_id: "t1" }] },
      { id: "p1", post_hashtags: [{ hashtag_id: "t1" }] },
      { id: "p2", post_hashtags: [{ hashtag_id: "t1" }] },
    ];

    expect(stripHashtagJoin(rows).map((row) => row.id)).toEqual(["p1", "p2"]);
  });

  test("null や非配列は空配列にする", () => {
    expect(stripHashtagJoin(null)).toEqual([]);
    expect(stripHashtagJoin(undefined)).toEqual([]);
  });
});

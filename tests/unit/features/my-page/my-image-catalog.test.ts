import {
  catalogForSource,
  applyMyImageCatalogFilter,
  parseMyImageCatalog,
} from "@/features/my-page/lib/my-image-catalog";

/** 自分自身を返すクエリビルダーの代わり(型を先に決めて、自己参照の any を避ける) */
interface RecordingQuery {
  eq: jest.Mock<RecordingQuery, unknown[]>;
  is: jest.Mock<RecordingQuery, unknown[]>;
  not: jest.Mock<RecordingQuery, unknown[]>;
}

function createQuery() {
  const calls: unknown[][] = [];
  const query: RecordingQuery = {
    eq: jest.fn((...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return query;
    }),
    is: jest.fn((...args: unknown[]) => {
      calls.push(["is", ...args]);
      return query;
    }),
    not: jest.fn((...args: unknown[]) => {
      calls.push(["not", ...args]);
      return query;
    }),
  };
  return { query, calls };
}

describe("parseMyImageCatalog", () => {
  test.each(["all", "my_catalog", "persta_original", "user_original"])(
    "%s はそのまま返す",
    (value) => {
      expect(parseMyImageCatalog(value)).toBe(value);
    },
  );

  test.each([null, undefined, "", "coordinate", "ALL"])(
    "知らない値・未指定(%p)は all にする",
    (value) => {
      expect(parseMyImageCatalog(value)).toBe("all");
    },
  );
});

describe("applyMyImageCatalogFilter", () => {
  test("all は条件を付けない", () => {
    const { query, calls } = createQuery();
    expect(applyMyImageCatalogFilter(query, "all")).toBe(query);
    expect(calls).toEqual([]);
  });

  test("my_catalog は自分のプロンプト(free・元の投稿なし)", () => {
    const { query, calls } = createQuery();
    applyMyImageCatalogFilter(query, "my_catalog");
    expect(calls).toEqual([
      ["eq", "generation_type", "free"],
      ["is", "source_post_id", null],
    ]);
  });

  test("persta_original は One-Tap Style", () => {
    const { query, calls } = createQuery();
    applyMyImageCatalogFilter(query, "persta_original");
    expect(calls).toEqual([["eq", "generation_type", "one_tap_style"]]);
  });

  test("user_original はみんなのカタログを使ったもの(free・元の投稿あり)", () => {
    const { query, calls } = createQuery();
    applyMyImageCatalogFilter(query, "user_original");
    expect(calls).toEqual([
      ["eq", "generation_type", "free"],
      ["not", "source_post_id", "is", null],
    ]);
  });
});

test("My Catalogの作り方だけを別のキャッシュキーとサーバー条件にする",()=>{
 expect(catalogForSource("my_catalog","prompt")).toBe("my_catalog_prompt");
 expect(catalogForSource("my_catalog","illustration")).toBe("my_catalog_illustration");
 expect(catalogForSource("my_catalog","all")).toBe("my_catalog");
 expect(catalogForSource("user_original","illustration")).toBe("user_original");
});
test.each(["my_catalog_prompt","my_catalog_illustration"] as const)("%sのサーバー絞り込み",catalog=>{
 const {query,calls}=createQuery();expect(parseMyImageCatalog(catalog)).toBe(catalog);applyMyImageCatalogFilter(query,catalog);
 expect(calls.slice(0,2)).toEqual([["eq","generation_type","free"],["is","source_post_id",null]]);
 expect(calls[2]).toEqual(catalog==="my_catalog_prompt"?["is","catalog_review",null]:["not","catalog_review","is",null]);
});

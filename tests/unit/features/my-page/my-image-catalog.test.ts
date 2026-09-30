import {
  applyMyImageCatalogFilter,
  parseMyImageCatalog,
} from "@/features/my-page/lib/my-image-catalog";

function createQuery() {
  const calls: unknown[][] = [];
  const query = {
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

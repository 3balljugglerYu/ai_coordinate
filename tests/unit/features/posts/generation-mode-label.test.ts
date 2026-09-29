import {
  getCardGenerationModeLabelKey,
  getGenerationModeLabelKey,
} from "@/features/posts/lib/generation-mode-label";

describe("getGenerationModeLabelKey", () => {
  it("collapses the coordinate family into modeCoordinate", () => {
    for (const type of [
      "coordinate",
      "specified_coordinate",
      "full_body",
      "chibi",
    ] as const) {
      expect(getGenerationModeLabelKey(type)).toBe("modeCoordinate");
    }
  });

  it("maps one_tap_style / inspire / free to their own keys", () => {
    expect(getGenerationModeLabelKey("one_tap_style")).toBe("modeOneTapStyle");
    expect(getGenerationModeLabelKey("inspire")).toBe("modeInspire");
    expect(getGenerationModeLabelKey("free")).toBe("modeFree");
  });

  it("returns null for unknown / null / undefined", () => {
    expect(getGenerationModeLabelKey(null)).toBeNull();
    expect(getGenerationModeLabelKey(undefined)).toBeNull();
    expect(getGenerationModeLabelKey("")).toBeNull();
    expect(getGenerationModeLabelKey("something_else")).toBeNull();
  });
});

/*
  カタログ刷新後(公開前は運営だけ)は、カタログのタブの名前に合わせる。
  ⭐ 作った本人のものは「〜 ORIGINAL」、それを使って作ったものは「with 〜」
  (2026-09-29 ユーザー決定)。
*/
describe("getGenerationModeLabelKey(カタログ刷新後)", () => {
  const SOURCE_POST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("ペルスタのスタイルで作ったものは with Persta ORIGINAL", () => {
    expect(
      getGenerationModeLabelKey("one_tap_style", { isCatalogRevamp: true }),
    ).toBe("modeWithPerstaOriginal");
  });

  it("ほかの人のプロンプトで作ったもの(元の投稿あり)は with User ORIGINAL", () => {
    expect(
      getGenerationModeLabelKey("free", {
        sourcePostId: SOURCE_POST_ID,
        isCatalogRevamp: true,
      }),
    ).toBe("modeWithUserOriginal");
  });

  it("自分のプロンプトで作ったもの(元の投稿なし)は User ORIGINAL", () => {
    expect(
      getGenerationModeLabelKey("free", { sourcePostId: null, isCatalogRevamp: true }),
    ).toBe("modeUserOriginal");
    expect(
      getGenerationModeLabelKey("free", { sourcePostId: undefined, isCatalogRevamp: true }),
    ).toBe("modeUserOriginal");
    // 空文字は元の投稿として扱わない
    expect(
      getGenerationModeLabelKey("free", { sourcePostId: "", isCatalogRevamp: true }),
    ).toBe("modeUserOriginal");
  });

  it("Coordinate と Creator Style は今の名前のまま", () => {
    for (const type of [
      "coordinate",
      "specified_coordinate",
      "full_body",
      "chibi",
    ] as const) {
      expect(getGenerationModeLabelKey(type, { isCatalogRevamp: true })).toBe(
        "modeCoordinate",
      );
    }
    expect(getGenerationModeLabelKey("inspire", { isCatalogRevamp: true })).toBe(
      "modeInspire",
    );
  });

  it("分からない種類は刷新後も出さない", () => {
    expect(getGenerationModeLabelKey(null, { isCatalogRevamp: true })).toBeNull();
    expect(
      getGenerationModeLabelKey("something_else", { isCatalogRevamp: true }),
    ).toBeNull();
  });

  it("⭐一般の利用者(刷新前)には、元の投稿があっても今の名前を出す", () => {
    expect(
      getGenerationModeLabelKey("free", {
        sourcePostId: SOURCE_POST_ID,
        isCatalogRevamp: false,
      }),
    ).toBe("modeFree");
    expect(
      getGenerationModeLabelKey("one_tap_style", { isCatalogRevamp: false }),
    ).toBe("modeOneTapStyle");
  });
});

/*
  画像の上(カード左下)のラベル。刷新後は使って作った投稿(with 〜)には出さない。
  出どころは引用元カードが示す(2026-09-30 ユーザー決定)。投稿の詳細の行は with 〜 を出す。
*/
describe("getCardGenerationModeLabelKey", () => {
  it("刷新後: 使って作った投稿には出さない", () => {
    expect(getCardGenerationModeLabelKey("one_tap_style", { isCatalogRevamp: true })).toBeNull();
    expect(
      getCardGenerationModeLabelKey("free", { sourcePostId: "src", isCatalogRevamp: true }),
    ).toBeNull();
  });

  it("刷新後: 自分のプロンプトは User ORIGINAL、Coordinate / Creator Style はそのまま", () => {
    expect(
      getCardGenerationModeLabelKey("free", { sourcePostId: null, isCatalogRevamp: true }),
    ).toBe("modeUserOriginal");
    expect(getCardGenerationModeLabelKey("chibi", { isCatalogRevamp: true })).toBe(
      "modeCoordinate",
    );
    expect(getCardGenerationModeLabelKey("inspire", { isCatalogRevamp: true })).toBe(
      "modeInspire",
    );
  });

  it("⭐一般の利用者(刷新前)は今の名前のまま", () => {
    expect(getCardGenerationModeLabelKey("one_tap_style")).toBe("modeOneTapStyle");
    expect(getCardGenerationModeLabelKey("free", { sourcePostId: "src" })).toBe("modeFree");
  });
});

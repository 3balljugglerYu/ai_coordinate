import { getGenerationModeLabelKey } from "@/features/posts/lib/generation-mode-label";

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
  カタログ刷新後(公開前は運営だけ)。
  ⭐ ORIGINAL は原本だけ。カタログの原本を使って作ったものは「from CATALOG」。
  原本は、見ている人が作者本人なら My ORIGINAL、ほかの人には User ORIGINAL(2026-09-30 ユーザー決定)。
*/
describe("getGenerationModeLabelKey(カタログ刷新後)", () => {
  const SOURCE_POST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const revamp = { isCatalogRevamp: true } as const;

  it("Perstaのカタログのスタイルで作ったものは「from CATALOG」", () => {
    expect(getGenerationModeLabelKey("one_tap_style", revamp)).toBe("modeFromCatalog");
  });

  it("ほかの人のカタログ(元の投稿あり)で作ったものも「from CATALOG」。見ている人に関係しない", () => {
    for (const isViewerAuthor of [false, true]) {
      expect(
        getGenerationModeLabelKey("free", {
          ...revamp,
          sourcePostId: SOURCE_POST_ID,
          isViewerAuthor,
        }),
      ).toBe("modeFromCatalog");
    }
    // 見ている人が確定する前でも出す(本人かどうかで変わらないため)
    expect(
      getGenerationModeLabelKey("free", {
        ...revamp,
        sourcePostId: SOURCE_POST_ID,
        isViewerResolved: false,
      }),
    ).toBe("modeFromCatalog");
  });

  it("原本(自分のプロンプト)は、作者本人には My ORIGINAL、ほかの人には User ORIGINAL", () => {
    expect(
      getGenerationModeLabelKey("free", { ...revamp, sourcePostId: null, isViewerAuthor: true }),
    ).toBe("modeMyOriginal");
    expect(
      getGenerationModeLabelKey("free", { ...revamp, sourcePostId: null, isViewerAuthor: false }),
    ).toBe("modeUserOriginal");
    // 空文字は元の投稿として扱わない
    expect(getGenerationModeLabelKey("free", { ...revamp, sourcePostId: "" })).toBe(
      "modeUserOriginal",
    );
  });

  it("⭐原本は、見ている人が確定するまで出さない(User → My と書き換わらないように)", () => {
    for (const isViewerAuthor of [false, true]) {
      expect(
        getGenerationModeLabelKey("free", {
          ...revamp,
          sourcePostId: null,
          isViewerResolved: false,
          isViewerAuthor,
        }),
      ).toBeNull();
    }
  });

  it("Coordinate と Creator Style は今の名前のまま。分からない種類は出さない", () => {
    expect(getGenerationModeLabelKey("chibi", revamp)).toBe("modeCoordinate");
    expect(getGenerationModeLabelKey("inspire", revamp)).toBe("modeInspire");
    expect(getGenerationModeLabelKey("something_else", revamp)).toBeNull();
  });

  it("⭐一般の利用者(刷新前)には、元の投稿の有無や見ている人に関係なく今の名前を出す", () => {
    expect(
      getGenerationModeLabelKey("free", { sourcePostId: SOURCE_POST_ID, isViewerAuthor: true }),
    ).toBe("modeFree");
    expect(
      getGenerationModeLabelKey("free", { sourcePostId: null, isViewerResolved: false }),
    ).toBe("modeFree");
    expect(getGenerationModeLabelKey("one_tap_style")).toBe("modeOneTapStyle");
  });
});

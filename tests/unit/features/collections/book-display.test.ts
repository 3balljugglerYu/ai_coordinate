/** @jest-environment node */

import {
  composeBookPages,
  isBookBackCoverMode,
  normalizeBookBackCoverMode,
  resolveBookPageAspectRatio,
} from "@/features/collections/lib/book-display";

describe("normalizeBookBackCoverMode", () => {
  it("既知の値はそのまま通す", () => {
    expect(normalizeBookBackCoverMode("default")).toBe("default");
    expect(normalizeBookBackCoverMode("last_page")).toBe("last_page");
  });

  it("未知値 / null / 非文字列は現行挙動の default へ倒す", () => {
    expect(normalizeBookBackCoverMode("leather")).toBe("default");
    expect(normalizeBookBackCoverMode(null)).toBe("default");
    expect(normalizeBookBackCoverMode(undefined)).toBe("default");
    expect(normalizeBookBackCoverMode(1)).toBe("default");
  });

  it("isBookBackCoverMode は許可値だけ true", () => {
    expect(isBookBackCoverMode("last_page")).toBe(true);
    expect(isBookBackCoverMode("last-page")).toBe(false);
    expect(isBookBackCoverMode(null)).toBe(false);
  });
});

describe("resolveBookPageAspectRatio", () => {
  it("明示比率は 幅/高さ の数値に解決する", () => {
    expect(resolveBookPageAspectRatio("3:4")).toBeCloseTo(0.75);
    expect(resolveBookPageAspectRatio("9:16")).toBeCloseTo(9 / 16);
    expect(resolveBookPageAspectRatio("1:1")).toBe(1);
    expect(resolveBookPageAspectRatio("16:9")).toBeCloseTo(16 / 9);
  });

  it("完走者ごとに比率が変わり得るモードは null(領域いっぱいへフォールバック)", () => {
    expect(resolveBookPageAspectRatio("source")).toBeNull();
    expect(resolveBookPageAspectRatio("user_select")).toBeNull();
    expect(resolveBookPageAspectRatio("preset_image")).toBeNull();
    expect(resolveBookPageAspectRatio(null)).toBeNull();
    expect(resolveBookPageAspectRatio(undefined)).toBeNull();
  });
});

describe("composeBookPages", () => {
  const pages = ["p1", "p2", "p3", "p4"];

  it("固定表紙が無ければ先頭を表紙に回し、残りが中身になる(既定)", () => {
    expect(
      composeBookPages({
        fixedCoverImageUrl: null,
        pageImageUrls: pages,
        backCoverMode: "default",
      }),
    ).toEqual({
      coverImageUrl: "p1",
      bodyImageUrls: ["p2", "p3", "p4"],
      backCoverImageUrl: null,
    });
  });

  it("固定表紙があれば全ページが中身になる", () => {
    expect(
      composeBookPages({
        fixedCoverImageUrl: "cover",
        pageImageUrls: pages,
        backCoverMode: "default",
      }),
    ).toEqual({
      coverImageUrl: "cover",
      bodyImageUrls: pages,
      backCoverImageUrl: null,
    });
  });

  it("last_page は末尾を裏表紙に回し、中身から外す", () => {
    expect(
      composeBookPages({
        fixedCoverImageUrl: null,
        pageImageUrls: pages,
        backCoverMode: "last_page",
      }),
    ).toEqual({
      coverImageUrl: "p1",
      bodyImageUrls: ["p2", "p3"],
      backCoverImageUrl: "p4",
    });
  });

  it("last_page + 固定表紙でも末尾を裏表紙に回す", () => {
    expect(
      composeBookPages({
        fixedCoverImageUrl: "cover",
        pageImageUrls: pages,
        backCoverMode: "last_page",
      }),
    ).toEqual({
      coverImageUrl: "cover",
      bodyImageUrls: ["p1", "p2", "p3"],
      backCoverImageUrl: "p4",
    });
  });

  it("中身が1枚しか残らないときは裏表紙へ回さない(読むページが消えるため)", () => {
    expect(
      composeBookPages({
        fixedCoverImageUrl: null,
        pageImageUrls: ["p1", "p2"],
        backCoverMode: "last_page",
      }),
    ).toEqual({
      coverImageUrl: "p1",
      bodyImageUrls: ["p2"],
      backCoverImageUrl: null,
    });
  });

  it("画像が1枚だけでも落ちない(表紙のみ・中身空)", () => {
    expect(
      composeBookPages({
        fixedCoverImageUrl: null,
        pageImageUrls: ["only"],
        backCoverMode: "last_page",
      }),
    ).toEqual({
      coverImageUrl: "only",
      bodyImageUrls: [],
      backCoverImageUrl: null,
    });
  });

  it("入力配列を破壊しない", () => {
    const input = [...pages];
    composeBookPages({
      fixedCoverImageUrl: "cover",
      pageImageUrls: input,
      backCoverMode: "last_page",
    });
    expect(input).toEqual(pages);
  });
});

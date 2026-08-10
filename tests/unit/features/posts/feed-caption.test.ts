import {
  FEED_CAPTION_MAX_LINES,
  normalizeFeedCaption,
} from "@/features/posts/lib/feed-caption";

describe("normalizeFeedCaption", () => {
  test("null / undefined / 空文字は空文字", () => {
    expect(normalizeFeedCaption(null)).toBe("");
    expect(normalizeFeedCaption(undefined)).toBe("");
    expect(normalizeFeedCaption("")).toBe("");
  });

  test("3つ以上の連続改行は空行1つ(改行2つ)まで詰める", () => {
    expect(normalizeFeedCaption("あ\n\n\n\n\nい")).toBe("あ\n\nい");
    // 空行1つ(=改行2つ)はそのまま残す。段落の区切りは意味があるため
    expect(normalizeFeedCaption("あ\n\nい")).toBe("あ\n\nい");
    // 単純な改行は保つ
    expect(normalizeFeedCaption("あ\nい")).toBe("あ\nい");
  });

  test("空白だけの行も空行として詰める", () => {
    expect(normalizeFeedCaption("あ\n   \n\t\nい")).toBe("あ\n\nい");
  });

  test("CRLF / CR を LF に統一する", () => {
    expect(normalizeFeedCaption("あ\r\nい\rう")).toBe("あ\nい\nう");
    expect(normalizeFeedCaption("あ\r\n\r\n\r\nい")).toBe("あ\n\nい");
  });

  test("前後の空白・改行は落とす", () => {
    expect(normalizeFeedCaption("\n\n  あ\n\n  ")).toBe("あ");
  });

  test("行頭のインデントは保つ(本文の表現を壊さない)", () => {
    expect(normalizeFeedCaption("あ\n   い")).toBe("あ\n   い");
  });

  test("折りたたみ行数は X と同じ5行", () => {
    expect(FEED_CAPTION_MAX_LINES).toBe(5);
  });
});

import {
  isLotteryEntryOpen,
  buildXLotteryIntentUrl,
  X_LOTTERY_COPY,
  type XLotteryCopy,
} from "@/features/campaigns/x-lottery-campaign";

const COPY: XLotteryCopy = {
  hashtags: ["うちの子のことわざ辞典"],
  mention: "mickey_fuku",
  message: "うちの子のことわざ辞典をコンプリートしました！",
  prizeLabel: "Amazonギフトカード3,000円分",
  rulesPath: "/campaigns/kotowaza-lottery",
};

const STARTS = "2026-07-18T09:00:00.000Z";
const ENDS = "2026-07-26T12:59:59.000Z";

describe("isLotteryEntryOpen", () => {
  test("対象フラグ off なら常に false", () => {
    expect(
      isLotteryEntryOpen(false, STARTS, ENDS, new Date("2026-07-20T00:00:00Z")),
    ).toBe(false);
  });

  test("対象フラグ on・期間内なら true", () => {
    expect(
      isLotteryEntryOpen(true, STARTS, ENDS, new Date("2026-07-20T00:00:00Z")),
    ).toBe(true);
  });

  test("開始前は false、開始時刻ちょうどは受付", () => {
    expect(
      isLotteryEntryOpen(true, STARTS, ENDS, new Date("2026-07-18T08:59:59Z")),
    ).toBe(false);
    expect(
      isLotteryEntryOpen(true, STARTS, ENDS, new Date("2026-07-18T09:00:00Z")),
    ).toBe(true);
  });

  test("終了時刻を過ぎたら false", () => {
    expect(
      isLotteryEntryOpen(true, STARTS, ENDS, new Date("2026-07-26T12:59:59Z")),
    ).toBe(true);
    expect(
      isLotteryEntryOpen(true, STARTS, ENDS, new Date("2026-07-26T13:00:00Z")),
    ).toBe(false);
  });

  test("期間が null(無制限)なら対象フラグだけで判定", () => {
    expect(isLotteryEntryOpen(true, null, null, new Date())).toBe(true);
    expect(isLotteryEntryOpen(false, null, null, new Date())).toBe(false);
  });
});

describe("buildXLotteryIntentUrl", () => {
  test("text にメッセージ+メンション、hashtags にタグ、url に台紙URLが入る", () => {
    const url = buildXLotteryIntentUrl(
      COPY,
      "https://www.persta.ai/m/abc?v=123",
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://x.com/intent/post");
    expect(parsed.searchParams.get("text")).toBe(
      "うちの子のことわざ辞典をコンプリートしました！ @mickey_fuku",
    );
    expect(parsed.searchParams.get("hashtags")).toBe("うちの子のことわざ辞典");
    expect(parsed.searchParams.get("url")).toBe(
      "https://www.persta.ai/m/abc?v=123",
    );
  });

  test("複数ハッシュタグはカンマ区切り", () => {
    const url = buildXLotteryIntentUrl(
      { ...COPY, hashtags: ["タグA", "タグB"] },
      "https://www.persta.ai/m/abc",
    );
    expect(new URL(url).searchParams.get("hashtags")).toBe("タグA,タグB");
  });

  test("現行 COPY 定数でも組み立てられる", () => {
    const url = buildXLotteryIntentUrl(X_LOTTERY_COPY, "https://www.persta.ai/m/x");
    expect(url.startsWith("https://x.com/intent/post?")).toBe(true);
  });
});

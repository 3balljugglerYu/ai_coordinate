import {
  isLotteryEntryOpen,
  buildXLotteryIntentUrl,
  getXLotteryCopy,
  X_LOTTERY_CAMPAIGNS,
  type XLotteryCopy,
} from "@/features/campaigns/x-lottery-campaign";

const COPY: XLotteryCopy = {
  hashtags: ["うちの子のことわざ辞典"],
  mention: "mickey_fuku",
  message: "うちの子のことわざ辞典をコンプリートしました！",
  prizeLabel: "Amazonギフトカード3,000円分",
  winnersLabel: "1名様",
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
  test("text 1パラメータに「メッセージ/URL/空行/@メンション/タグ行」の改行レイアウトで入る", () => {
    const url = buildXLotteryIntentUrl(
      COPY,
      "https://www.persta.ai/m/abc?v=123",
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://twitter.com/intent/tweet");
    expect(parsed.searchParams.get("text")).toBe(
      [
        "うちの子のことわざ辞典をコンプリートしました！",
        "https://www.persta.ai/m/abc?v=123",
        "",
        "@mickey_fuku",
        "#うちの子のことわざ辞典",
      ].join("\n"),
    );
    // 1行連結表示になる url / hashtags パラメータは使わない
    expect(parsed.searchParams.get("url")).toBeNull();
    expect(parsed.searchParams.get("hashtags")).toBeNull();
  });

  test("複数ハッシュタグは # 付きスペース区切りで1行にまとまる", () => {
    const url = buildXLotteryIntentUrl(
      { ...COPY, hashtags: ["タグA", "タグB"] },
      "https://www.persta.ai/m/abc",
    );
    expect(new URL(url).searchParams.get("text")).toContain("#タグA #タグB");
  });

  test("登録済みキャンペーンの文面でも組み立てられる", () => {
    for (const copy of Object.values(X_LOTTERY_CAMPAIGNS)) {
      const url = buildXLotteryIntentUrl(copy, "https://www.persta.ai/m/x");
      expect(url.startsWith("https://twitter.com/intent/tweet?")).toBe(true);
    }
  });
});

describe("getXLotteryCopy", () => {
  test("ファッション雑誌の文面が引ける(タグ・メンション・5名様・規約パス)", () => {
    const copy = getXLotteryCopy("fashion_magazine_summer");
    expect(copy).not.toBeNull();
    expect(copy?.hashtags).toEqual(["うちの子のファッション雑誌", "PerstaAI"]);
    expect(copy?.mention).toBe("mickey_fuku");
    expect(copy?.winnersLabel).toBe("5名様");
    expect(copy?.prizeLabel).toBe("Amazonギフト券2,000円分");
    expect(copy?.rulesPath).toBe("/campaigns/fashion-magazine-lottery");
  });

  test("ことわざ(上下巻)の文面も残っている", () => {
    expect(getXLotteryCopy("kotowaza_dictionary")).not.toBeNull();
    expect(getXLotteryCopy("kotowaza_dictionary_2")).not.toBeNull();
  });

  test("未登録カテゴリは null(lottery_target が立っていてもボタンを出さない)", () => {
    expect(getXLotteryCopy("travel_to_italy")).toBeNull();
    expect(getXLotteryCopy("unknown_category")).toBeNull();
  });

  test("応募intentのファッション雑誌の投稿本文がユーザー確定レイアウトと一致する", () => {
    const copy = getXLotteryCopy("fashion_magazine_summer");
    if (!copy) throw new Error("copy missing");
    const url = new URL(
      buildXLotteryIntentUrl(copy, "https://www.persta.ai/m/abc/book"),
    );
    expect(url.searchParams.get("text")).toBe(
      [
        "うちの子のファッション雑誌、完成しました！",
        "https://www.persta.ai/m/abc/book",
        "",
        "@mickey_fuku",
        "#うちの子のファッション雑誌 #PerstaAI",
      ].join("\n"),
    );
  });
});

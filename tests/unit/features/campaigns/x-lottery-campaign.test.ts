import {
  findActiveXLotteryCampaign,
  buildXLotteryIntentUrl,
  type XLotteryCampaign,
} from "@/features/campaigns/x-lottery-campaign";

const CAMPAIGN: XLotteryCampaign = {
  id: "test-campaign",
  categoryKeys: ["kotowaza_dictionary", "kotowaza_dictionary_2"],
  entryStartsAt: "2026-07-18T09:00:00.000Z",
  entryEndsAt: "2026-07-26T12:59:59.000Z",
  hashtags: ["うちの子のことわざ辞典"],
  mention: "mickey_fuku",
  message: "うちの子のことわざ辞典をコンプリートしました！",
  rulesPath: "/campaigns/kotowaza-lottery",
};
const CAMPAIGNS = [CAMPAIGN];

describe("findActiveXLotteryCampaign", () => {
  test("対象カテゴリ・期間内なら該当キャンペーンを返す", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    expect(
      findActiveXLotteryCampaign("kotowaza_dictionary", now, CAMPAIGNS),
    ).toBe(CAMPAIGN);
    // 下巻カテゴリも同一キャンペーン対象
    expect(
      findActiveXLotteryCampaign("kotowaza_dictionary_2", now, CAMPAIGNS),
    ).toBe(CAMPAIGN);
  });

  test("対象外カテゴリは null", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    expect(
      findActiveXLotteryCampaign("travel_to_italy", now, CAMPAIGNS),
    ).toBeNull();
  });

  test("categoryKey が null/undefined は null", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    expect(findActiveXLotteryCampaign(null, now, CAMPAIGNS)).toBeNull();
    expect(findActiveXLotteryCampaign(undefined, now, CAMPAIGNS)).toBeNull();
  });

  test("開始前は null、開始時刻ちょうどは受付", () => {
    expect(
      findActiveXLotteryCampaign(
        "kotowaza_dictionary",
        new Date("2026-07-18T08:59:59.000Z"),
        CAMPAIGNS,
      ),
    ).toBeNull();
    expect(
      findActiveXLotteryCampaign(
        "kotowaza_dictionary",
        new Date("2026-07-18T09:00:00.000Z"),
        CAMPAIGNS,
      ),
    ).toBe(CAMPAIGN);
  });

  test("終了時刻を過ぎたら null", () => {
    expect(
      findActiveXLotteryCampaign(
        "kotowaza_dictionary",
        new Date("2026-07-26T12:59:59.000Z"),
        CAMPAIGNS,
      ),
    ).toBe(CAMPAIGN);
    expect(
      findActiveXLotteryCampaign(
        "kotowaza_dictionary",
        new Date("2026-07-26T13:00:00.000Z"),
        CAMPAIGNS,
      ),
    ).toBeNull();
  });
});

describe("buildXLotteryIntentUrl", () => {
  test("text にメッセージ+メンション、hashtags にタグ、url に台紙URLが入る", () => {
    const url = buildXLotteryIntentUrl(
      CAMPAIGN,
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
      { ...CAMPAIGN, hashtags: ["タグA", "タグB"] },
      "https://www.persta.ai/m/abc",
    );
    expect(new URL(url).searchParams.get("hashtags")).toBe("タグA,タグB");
  });
});

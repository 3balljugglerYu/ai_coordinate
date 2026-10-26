/**
 * 企画の贈り物の決まり(出すページ・出すか・この端末で閉じたことの覚え方・期限の表示)。
 */

import {
  __resetCampaignGiftLaterForTest,
  CAMPAIGN_GIFT_LATER_MS,
  campaignGiftDismissKey,
  formatCampaignGiftExpire,
  formatCampaignGiftExpireShort,
  isCampaignGiftExcludedPath,
  isCampaignGiftKey,
  readCampaignGiftDismissed,
  readCampaignGiftLater,
  shouldShowCampaignGift,
  writeCampaignGiftDismissed,
  writeCampaignGiftLater,
  type CampaignGiftStatus,
} from "@/features/campaigns/campaign-gift/campaign-gift";

const OPEN: CampaignGiftStatus = { open: true, claimed: false, signedIn: true, amount: 200, expireAt: "2026-10-31T14:59:00.000Z" };

beforeEach(() => {
  __resetCampaignGiftLaterForTest();
  window.localStorage.clear();
  jest.restoreAllMocks();
});

test("知っている企画だけを受け付ける", () => {
  expect(isCampaignGiftKey("halloween-best-shot")).toBe(true);
  expect(isCampaignGiftKey("unknown")).toBe(false);
  expect(isCampaignGiftKey("")).toBe(false);
});

test.each(["/admin", "/admin/users", "/auth/callback", "/login", "/signup", "/reset-password/confirm", "/account/reactivate", "/credits/purchase"])(
  "%s では出さない",
  (path) => {
    expect(isCampaignGiftExcludedPath(path)).toBe(true);
  },
);

test.each(["/", "/style", "/campaigns/halloween-best-shot", "/user-styles", "/administrator", "/credits"])("%s では出す", (path) => {
  expect(isCampaignGiftExcludedPath(path)).toBe(false);
});

describe("shouldShowCampaignGift", () => {
  test("受け付けの期間中で、まだ受け取っておらず、この端末で閉じていなければ出す", () => {
    expect(shouldShowCampaignGift({ status: OPEN, dismissed: false, later: false })).toBe(true);
  });

  test("期間の外・受け取り済み・この端末で閉じたときは出さない", () => {
    expect(shouldShowCampaignGift({ status: { ...OPEN, open: false }, dismissed: false, later: false })).toBe(false);
    expect(shouldShowCampaignGift({ status: { ...OPEN, claimed: true }, dismissed: false, later: false })).toBe(false);
    expect(shouldShowCampaignGift({ status: OPEN, dismissed: true, later: false })).toBe(false);
    expect(shouldShowCampaignGift({ status: OPEN, dismissed: false, later: true })).toBe(false);
  });
});

describe("この端末で閉じたことの覚え方", () => {
  test("人ごとに分ける(ログインしていないときに閉じても、ログインしたあとはもう一度出る)", () => {
    writeCampaignGiftDismissed("halloween-best-shot", null);
    expect(readCampaignGiftDismissed("halloween-best-shot", null)).toBe(true);
    expect(readCampaignGiftDismissed("halloween-best-shot", "user-1")).toBe(false);
    expect(campaignGiftDismissKey("halloween-best-shot", "user-1")).toBe("campaign-gift-dismissed:halloween-best-shot:user-1");
  });

  test("storage が使えない端末でも投げない(読めなければ、閉じていない扱い)", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeCampaignGiftDismissed("halloween-best-shot", "user-1")).not.toThrow();
    expect(readCampaignGiftDismissed("halloween-best-shot", "user-1")).toBe(false);
  });
});

test("期限は日本時間で表示する", () => {
  expect(formatCampaignGiftExpire("2026-10-31T14:59:00.000Z")).toBe("10月31日 23:59");
  expect(formatCampaignGiftExpire(null)).toBeNull();
  expect(formatCampaignGiftExpire("not a date")).toBeNull();
});

test("期限の日付の短い表示は、日本時間の月/日", () => {
  expect(formatCampaignGiftExpireShort("2026-10-31T14:59:00.000Z")).toBe("10/31");
  expect(formatCampaignGiftExpireShort("2026-10-31T15:30:00.000Z")).toBe("11/1");
  expect(formatCampaignGiftExpireShort(null)).toBeNull();
  expect(formatCampaignGiftExpireShort("bad")).toBeNull();
});

describe("「あとで」の覚え方(3時間・人ごと)", () => {
  const NOW = Date.parse("2026-10-27T03:00:00.000Z");

  test("3時間は出さず、3時間たったら出す", () => {
    writeCampaignGiftLater("halloween-best-shot", "user-1", NOW);
    expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW + 1)).toBe(true);
    expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW + CAMPAIGN_GIFT_LATER_MS - 1)).toBe(true);
    expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW + CAMPAIGN_GIFT_LATER_MS)).toBe(false);
  });

  test("人ごとに分け、localStorage に時刻で残す(ブラウザを閉じるまで、ではない)", () => {
    writeCampaignGiftLater("halloween-best-shot", null, NOW);
    expect(readCampaignGiftLater("halloween-best-shot", null, NOW)).toBe(true);
    expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW)).toBe(false);
    expect(window.localStorage.getItem("campaign-gift-later-v2:halloween-best-shot:guest")).toBe(String(NOW));
    expect(window.sessionStorage.getItem("campaign-gift-later-v2:halloween-best-shot:guest")).toBeNull();
  });

  test("端末に残せないブラウザでも投げず、ページを開いている間は覚える", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeCampaignGiftLater("halloween-best-shot", "user-1", NOW)).not.toThrow();
    expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW + 1000)).toBe(true);
  });

  test("こわれた値は、無い扱い", () => {
    window.localStorage.setItem("campaign-gift-later-v2:halloween-best-shot:user-1", "abc");
    expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW)).toBe(false);
  });
});

test("端末の時計が戻って、残した時刻が未来になっても、ページの中の控えは効く", () => {
  const NOW = Date.parse("2026-10-27T03:00:00.000Z");
  writeCampaignGiftLater("halloween-best-shot", "user-1", NOW);
  window.localStorage.setItem("campaign-gift-later-v2:halloween-best-shot:user-1", String(NOW + 60 * 60 * 1000));
  expect(readCampaignGiftLater("halloween-best-shot", "user-1", NOW + 1000)).toBe(true);
});

test("受け取って閉じたら、「あとで」の時刻は消す", () => {
  window.localStorage.setItem("campaign-gift-later-v2:halloween-best-shot:user-1", "1");
  writeCampaignGiftDismissed("halloween-best-shot", "user-1");
  expect(window.localStorage.getItem("campaign-gift-later-v2:halloween-best-shot:user-1")).toBeNull();
});


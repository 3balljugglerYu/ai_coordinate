/**
 * 企画の贈り物の決まり(出すページ・出すか・この端末で閉じたことの覚え方・期限の表示)。
 */

import {
  campaignGiftDismissKey,
  formatCampaignGiftExpire,
  isCampaignGiftExcludedPath,
  isCampaignGiftKey,
  readCampaignGiftDismissed,
  shouldShowCampaignGift,
  writeCampaignGiftDismissed,
  type CampaignGiftStatus,
} from "@/features/campaigns/campaign-gift/campaign-gift";

const OPEN: CampaignGiftStatus = { open: true, claimed: false, signedIn: true, amount: 200, expireAt: "2026-10-31T14:59:00.000Z" };

beforeEach(() => {
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
    expect(shouldShowCampaignGift({ status: OPEN, dismissed: false })).toBe(true);
  });

  test("期間の外・受け取り済み・この端末で閉じたときは出さない", () => {
    expect(shouldShowCampaignGift({ status: { ...OPEN, open: false }, dismissed: false })).toBe(false);
    expect(shouldShowCampaignGift({ status: { ...OPEN, claimed: true }, dismissed: false })).toBe(false);
    expect(shouldShowCampaignGift({ status: OPEN, dismissed: true })).toBe(false);
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

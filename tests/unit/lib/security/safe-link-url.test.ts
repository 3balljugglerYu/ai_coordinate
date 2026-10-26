/**
 * 運営が書くリンク(バナー・ポップアップ・お知らせ)の行き先の決まり。
 */

import { toSafeLinkUrl } from "@/lib/security/safe-link-url";
import { isValidLinkUrl } from "@/features/banners/lib/validation";
import { isSafeAnnouncementLinkUrl } from "@/features/announcements/lib/announcement-rich-text";

describe("toSafeLinkUrl", () => {
  test.each([
    ["/campaigns/halloween-best-shot#hbs-works", "/campaigns/halloween-best-shot#hbs-works"],
    ["/ja/style?utm_source=banner", "/ja/style?utm_source=banner"],
    ["  /pricing  ", "/pricing"],
    ["https://x.com/mickey_fuku", "https://x.com/mickey_fuku"],
    ["https://www.persta.ai/ja/about?a=1", "https://www.persta.ai/ja/about?a=1"],
  ])("%j はそのまま使う", (input, expected) => {
    expect(toSafeLinkUrl(input)).toBe(expected);
  });

  test.each([
    "/\\evil.com",
    "/\\/evil.com",
    "//evil.com",
    "/..//evil.com",
    "/./\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
    "http://example.com",
    "https:/evil.com",
    "https://",
    "https://evil.com\\@www.persta.ai",
    "https://evil .com",
    "evil.com",
    "",
    "   ",
    null,
    undefined,
  ])("%j は使わない", (input) => {
    expect(toSafeLinkUrl(input)).toBeNull();
  });
});

describe("保存の確かめ方も同じ決まり", () => {
  test.each(["/\\evil.com", "/..//evil.com", "/\t/evil.com"])("バナー・ポップアップは %j を断る", (input) => {
    expect(isValidLinkUrl(input)).toBe(false);
  });

  test("バナー・ポップアップは、ふつうのパスと https を通す", () => {
    expect(isValidLinkUrl("/campaigns/halloween-best-shot")).toBe(true);
    expect(isValidLinkUrl("https://x.com/")).toBe(true);
  });

  test.each(["/..//evil.com", "/./..//evil.com"])("お知らせは %j を断る", (input) => {
    expect(isSafeAnnouncementLinkUrl(input)).toBe(false);
  });

  test("お知らせは、ふつうのパスを通す", () => {
    expect(isSafeAnnouncementLinkUrl("/campaigns/halloween-best-shot#hbs-works")).toBe(true);
  });
});

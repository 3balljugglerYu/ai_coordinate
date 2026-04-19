/** @jest-environment node */

jest.mock("@/lib/public-env", () => ({
  getSiteUrlForClient: jest.fn(),
}));

import { getSiteUrlForClient } from "@/lib/public-env";
import { getPostDetailPath, getPostDetailUrl } from "@/lib/url-utils";

const mockGetSiteUrlForClient = getSiteUrlForClient as jest.MockedFunction<
  typeof getSiteUrlForClient
>;

describe("UrlUtils unit tests from EARS specs", () => {
  beforeEach(() => {
    mockGetSiteUrlForClient.mockReset();
  });

  describe("URLUTIL-001 getPostDetailPath", () => {
    test("getPostDetailPath_通常のpostIdの場合_posts相対パスを返す", () => {
      // Spec: URLUTIL-001
      expect(getPostDetailPath("post-123")).toBe("/posts/post-123");
      expect(getPostDetailPath("")).toBe("/posts/");
    });

    test("getPostDetailPath_予約文字を含む場合_エンコード済みパスを返す", () => {
      // Spec: URLUTIL-001
      expect(getPostDetailPath("abc/def?x=1")).toBe("/posts/abc%2Fdef%3Fx%3D1");
    });
  });

  describe("URLUTIL-002 getPostDetailUrl", () => {
    test("getPostDetailUrl_baseUrlが空の場合_相対パスを返す", () => {
      // Spec: URLUTIL-002
      mockGetSiteUrlForClient.mockReturnValue("");

      const first = getPostDetailUrl("abc/def");
      const second = getPostDetailUrl("abc/def");

      expect(first).toBe("/posts/abc%2Fdef");
      expect(second).toBe("/posts/abc%2Fdef");
      expect(mockGetSiteUrlForClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("URLUTIL-003 getPostDetailUrl", () => {
    test("getPostDetailUrl_baseUrlに末尾スラッシュがない場合_絶対URLを返す", () => {
      // Spec: URLUTIL-003
      mockGetSiteUrlForClient.mockReturnValue("https://example.com");

      expect(getPostDetailUrl("post-1")).toBe("https://example.com/posts/post-1");
    });

    test("getPostDetailUrl_baseUrlに末尾スラッシュがある場合_正規化して絶対URLを返す", () => {
      // Spec: URLUTIL-003
      mockGetSiteUrlForClient.mockReturnValue("https://example.com///");

      expect(getPostDetailUrl("post-1")).toBe("https://example.com/posts/post-1");
    });
  });

  describe("URLUTIL-004 getPostDetailUrl with locale", () => {
    test("getPostDetailUrl_localeを指定した場合_ロケールプレフィックス付きURLを返す", () => {
      mockGetSiteUrlForClient.mockReturnValue("https://example.com");

      expect(getPostDetailUrl("post-1", "ja")).toBe("https://example.com/ja/posts/post-1");
      expect(getPostDetailUrl("post-1", "en")).toBe("https://example.com/en/posts/post-1");
    });

    test("getPostDetailUrl_localeを省略した場合_従来通りプレフィックスなしURLを返す", () => {
      mockGetSiteUrlForClient.mockReturnValue("https://example.com");

      expect(getPostDetailUrl("post-1")).toBe("https://example.com/posts/post-1");
    });

    test("getPostDetailUrl_localeありでbaseUrlが空の場合_ロケール付き相対パスを返す", () => {
      mockGetSiteUrlForClient.mockReturnValue("");

      expect(getPostDetailUrl("post-1", "ja")).toBe("/ja/posts/post-1");
    });
  });
});

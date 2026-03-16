import {
  appendSearchAndHash,
  getLocaleCookieMaxAge,
  getLocaleLabel,
  isLocale,
  isPublicPath,
  localizePublicPath,
  resolveLocaleFromAcceptLanguage,
  resolveRequestLocale,
  stripLocalePrefix,
} from "@/i18n/config";

describe("I18nConfig unit tests from EARS specs", () => {
  describe("I18N-001 isLocale", () => {
    test("isLocale_サポート対象のlocaleの場合_trueを返す", () => {
      expect(isLocale("ja")).toBe(true);
      expect(isLocale("en")).toBe(true);
    });

    test("isLocale_未対応またはnullishの値の場合_falseを返す", () => {
      expect(isLocale("fr")).toBe(false);
      expect(isLocale("")).toBe(false);
      expect(isLocale(undefined)).toBe(false);
      expect(isLocale(null)).toBe(false);
    });
  });

  describe("I18N-002 getLocaleLabel", () => {
    test("getLocaleLabel_jaの場合_日本語ラベルを返す", () => {
      expect(getLocaleLabel("ja")).toBe("日本語");
    });

    test("getLocaleLabel_enの場合_英語ラベルを返す", () => {
      expect(getLocaleLabel("en")).toBe("English");
    });
  });

  describe("I18N-003 getLocaleCookieMaxAge", () => {
    test("getLocaleCookieMaxAge_呼び出された場合_1年相当の秒数を返す", () => {
      expect(getLocaleCookieMaxAge()).toBe(60 * 60 * 24 * 365);
    });
  });

  describe("I18N-004 stripLocalePrefix", () => {
    test("stripLocalePrefix_locale付きパスの場合_localeと正規化済みパスを返す", () => {
      expect(stripLocalePrefix("/ja//posts//sample-post/")).toEqual({
        locale: "ja",
        pathname: "/posts/sample-post",
      });
    });

    test("stripLocalePrefix_localeなしパスの場合_元のパスを返す", () => {
      expect(stripLocalePrefix("/dashboard")).toEqual({
        pathname: "/dashboard",
      });
    });

    test("stripLocalePrefix_localeルートの場合_ルートパスを返す", () => {
      expect(stripLocalePrefix("/en")).toEqual({
        locale: "en",
        pathname: "/",
      });
    });
  });

  describe("I18N-005 isPublicPath", () => {
    test("isPublicPath_設定済み公開パスの場合_trueを返す", () => {
      expect(isPublicPath("/")).toBe(true);
      expect(isPublicPath("/about")).toBe(true);
      expect(isPublicPath("/posts/post-123")).toBe(true);
      expect(isPublicPath("/i2i/demo-slug")).toBe(true);
    });

    test("isPublicPath_内部パスの場合_falseを返す", () => {
      expect(isPublicPath("/dashboard")).toBe(false);
      expect(isPublicPath("/api/posts")).toBe(false);
    });
  });

  describe("I18N-006 localizePublicPath", () => {
    test("localizePublicPath_ルート公開パスの場合_localeルートを返す", () => {
      expect(localizePublicPath("/", "en")).toBe("/en");
    });

    test("localizePublicPath_locale有無にかかわらず公開パスの場合_locale付きパスを返す", () => {
      expect(localizePublicPath("/about", "ja")).toBe("/ja/about");
      expect(localizePublicPath("/en/posts/post-123", "ja")).toBe(
        "/ja/posts/post-123"
      );
    });

    test("localizePublicPath_非公開パスの場合_prefixなしパスを返す", () => {
      expect(localizePublicPath("/dashboard", "en")).toBe("/dashboard");
    });
  });

  describe("I18N-007 appendSearchAndHash", () => {
    test("appendSearchAndHash_prefixなしsearchとhashの場合_正規化して付加する", () => {
      expect(appendSearchAndHash("/en/about", "foo=1", "section-2")).toBe(
        "/en/about?foo=1#section-2"
      );
    });

    test("appendSearchAndHash_searchまたはhashが欠けている場合_渡されたものだけ付加する", () => {
      expect(appendSearchAndHash("/en/about", undefined, "section-2")).toBe(
        "/en/about#section-2"
      );
      expect(appendSearchAndHash("/en/about", "?foo=1")).toBe("/en/about?foo=1");
    });
  });

  describe("I18N-008 resolveLocaleFromAcceptLanguage", () => {
    test("resolveLocaleFromAcceptLanguage_ヘッダー未指定の場合_DEFAULT_LOCALEを返す", () => {
      expect(resolveLocaleFromAcceptLanguage(undefined)).toBe("en");
      expect(resolveLocaleFromAcceptLanguage(null)).toBe("en");
    });

    test("resolveLocaleFromAcceptLanguage_ja系候補がある場合_jaを返す", () => {
      expect(
        resolveLocaleFromAcceptLanguage("fr-CH,ja;q=0.5,en;q=0.9")
      ).toBe("ja");
      expect(
        resolveLocaleFromAcceptLanguage("en-US,en;q=0.8,ja-JP;q=0.1")
      ).toBe("ja");
    });

    test("resolveLocaleFromAcceptLanguage_ja系以外のみの場合_enを返す", () => {
      expect(resolveLocaleFromAcceptLanguage("fr,de;q=0.8,en;q=0.7")).toBe("en");
    });

    test("resolveLocaleFromAcceptLanguage_quality値が不正な場合_既定qualityで扱う", () => {
      expect(resolveLocaleFromAcceptLanguage("ja;q=abc,en;q=0.5")).toBe("ja");
    });
  });

  describe("I18N-009 resolveRequestLocale", () => {
    test("resolveRequestLocale_pathnameにlocaleがある場合_cookieよりpathnameを優先する", () => {
      expect(
        resolveRequestLocale({
          pathname: "/ja/about",
          cookieLocale: "en",
          acceptLanguage: "fr,de;q=0.8",
        })
      ).toBe("ja");
    });

    test("resolveRequestLocale_pathnameにlocaleがなく有効cookieがある場合_cookieを返す", () => {
      expect(
        resolveRequestLocale({
          pathname: "/about",
          cookieLocale: "ja",
          acceptLanguage: "en-US,en;q=0.8",
        })
      ).toBe("ja");
    });

    test("resolveRequestLocale_pathnameにlocaleがなくcookieが無効な場合_AcceptLanguageへフォールバックする", () => {
      expect(
        resolveRequestLocale({
          pathname: "/about",
          cookieLocale: "fr",
          acceptLanguage: "de,en;q=0.8",
        })
      ).toBe("en");
    });

    test("resolveRequestLocale_入力不足の場合_AcceptLanguage解決経由でDEFAULT_LOCALEを返す", () => {
      expect(
        resolveRequestLocale({
          pathname: "/dashboard",
          cookieLocale: undefined,
          acceptLanguage: undefined,
        })
      ).toBe("en");
    });
  });
});

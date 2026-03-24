import { renderHook } from "@testing-library/react";
import {
  useWebViewDetection,
  buildIntentUrl,
  buildLineExternalUrl,
} from "@/features/auth/components/WebViewBanner";

const originalUserAgent = navigator.userAgent;
const originalLocation = window.location;

function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, "userAgent", {
    value: originalUserAgent,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

describe("useWebViewDetection", () => {
  describe("WV-001 LINE自動リダイレクト", () => {
    test("LINEアプリ内ブラウザの場合_openExternalBrowserパラメータ付きURLにリダイレクトする", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0"
      );
      Object.defineProperty(window, "location", {
        value: { ...originalLocation, href: "http://localhost:3000/login", search: "" },
        writable: true,
        configurable: true,
      });

      // Act
      renderHook(() => useWebViewDetection());

      // Assert
      expect(window.location.href).toContain("openExternalBrowser=1");
    });

    test("LINEでopenExternalBrowser=1が既に付与済みの場合_リダイレクトせずWebView検出を返す", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0"
      );
      Object.defineProperty(window, "location", {
        value: {
          ...originalLocation,
          href: "http://localhost:3000/login?openExternalBrowser=1",
          search: "?openExternalBrowser=1",
        },
        writable: true,
        configurable: true,
      });

      // Act
      const { result } = renderHook(() => useWebViewDetection());

      // Assert
      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("line");
      expect(result.current.appName).toBe("LINE");
    });
  });

  describe("WV-002 各WebViewアプリの検出", () => {
    test("X（iOS）の場合_appがxでappNameがXを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("x");
      expect(result.current.appName).toBe("X");
      expect(result.current.isAndroid).toBe(false);
    });

    test("X（Android）の場合_appがxでisAndroidがtrueを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 TwitterAndroid"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("x");
      expect(result.current.isAndroid).toBe(true);
    });

    test("Facebook（iOS）の場合_appがfacebookを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0;]"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("facebook");
      expect(result.current.appName).toBe("Facebook");
      expect(result.current.isAndroid).toBe(false);
    });

    test("Facebook（Android）の場合_isAndroidがtrueを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/400.0;]"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("facebook");
      expect(result.current.isAndroid).toBe(true);
    });

    test("Instagram（iOS）の場合_appがinstagramを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("instagram");
      expect(result.current.appName).toBe("Instagram");
    });

    test("TikTok（iOS）の場合_appがtiktokを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BytedanceWebview/d8a21c6"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("tiktok");
      expect(result.current.appName).toBe("TikTok");
      expect(result.current.isAndroid).toBe(false);
    });

    test("TikTok（Android）の場合_appがtiktokでisAndroidがtrueを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36; wv BytedanceWebview/d8a21c6"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("tiktok");
      expect(result.current.isAndroid).toBe(true);
    });

    test("WeChat内ブラウザの場合_appがwechatを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("wechat");
      expect(result.current.appName).toBe("WeChat");
    });

    test("汎用Android WebViewの場合_appがotherでisAndroidがtrueを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36; wv"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(true);
      expect(result.current.app).toBe("other");
      expect(result.current.isAndroid).toBe(true);
    });
  });

  describe("WV-003 通常ブラウザでは非検出", () => {
    test("Safari（iOS）の場合_isWebViewがfalseを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(false);
      expect(result.current.app).toBeNull();
    });

    test("Chrome（Android）の場合_isWebViewがfalseを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(false);
    });

    test("デスクトップChromeの場合_isWebViewがfalseを返す", () => {
      mockUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      const { result } = renderHook(() => useWebViewDetection());

      expect(result.current.isWebView).toBe(false);
    });
  });
});

describe("buildIntentUrl", () => {
  test("intent://スキームURLを正しく構築する", () => {
    const result = buildIntentUrl("https://persta.ai/login?next=/mypage");

    expect(result).toContain("intent://persta.ai/login?next=/mypage");
    expect(result).toContain("scheme=https");
    expect(result).toContain("package=com.android.chrome");
    expect(result).toContain(
      `S.browser_fallback_url=${encodeURIComponent("https://persta.ai/login?next=/mypage")}`
    );
  });

  test("hashを含むURLからhashを除去してfallbackUrlを構築する", () => {
    const result = buildIntentUrl("https://persta.ai/login#section");

    // fallback URL にハッシュが含まれないこと
    expect(result).toContain(
      `S.browser_fallback_url=${encodeURIComponent("https://persta.ai/login")}`
    );
  });
});

describe("buildLineExternalUrl", () => {
  test("現在のURLにopenExternalBrowser=1を付与する", () => {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "http://localhost:3000/login" },
      writable: true,
      configurable: true,
    });

    const result = buildLineExternalUrl();

    expect(result).toContain("openExternalBrowser=1");
    expect(result).toContain("localhost:3000/login");
  });
});

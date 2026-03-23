import { fireEvent, render, screen } from "@testing-library/react";
import { WebViewBanner } from "@/features/auth/components/WebViewBanner";

jest.mock("next-intl", () => {
  const { jaMessages } = require("@/messages/ja");

  return {
    useTranslations: (namespace?: string) => {
      const table =
        namespace && namespace in jaMessages
          ? (jaMessages as Record<string, Record<string, string>>)[namespace]
          : {};

      return (key: string) => table[key] ?? key;
    },
  };
});

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

describe("WebViewBanner", () => {
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
      render(<WebViewBanner />);

      // Assert — LINE の場合はバナーを表示せずリダイレクト
      expect(
        screen.queryByText("アプリ内ブラウザではログインできません")
      ).not.toBeInTheDocument();
      expect(window.location.href).toContain("openExternalBrowser=1");
    });

    test("LINEでopenExternalBrowser=1が既に付与済みの場合_リダイレクトせずバナーを表示する", () => {
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
      render(<WebViewBanner />);

      // Assert — リダイレクトループせずバナーにフォールバック
      expect(
        screen.getByText("アプリ内ブラウザではログインできません")
      ).toBeInTheDocument();
    });
  });

  describe("WV-002 その他WebViewでバナー表示", () => {
    test("Facebook内ブラウザの場合_警告バナーを表示する", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0;]"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.getByText("アプリ内ブラウザではログインできません")
      ).toBeInTheDocument();
    });

    test("Instagram内ブラウザの場合_警告バナーを表示する", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.getByText("アプリ内ブラウザではログインできません")
      ).toBeInTheDocument();
    });

    test("WeChat内ブラウザの場合_警告バナーを表示する", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.getByText("アプリ内ブラウザではログインできません")
      ).toBeInTheDocument();
    });

    test("Android WebViewの場合_警告バナーを表示する", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36; wv"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.getByText("アプリ内ブラウザではログインできません")
      ).toBeInTheDocument();
    });
  });

  describe("WV-003 通常ブラウザ・Xでは非表示", () => {
    test("Safari（iOS）の場合_バナーを表示しない", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.queryByText("アプリ内ブラウザではログインできません")
      ).not.toBeInTheDocument();
    });

    test("Chrome（Android）の場合_バナーを表示しない", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.queryByText("アプリ内ブラウザではログインできません")
      ).not.toBeInTheDocument();
    });

    test("X（Twitter）アプリ内ブラウザの場合_バナーを表示しない", () => {
      // Arrange — X は SFSafariViewController/Chrome Custom Tabs を使用するため検出対象外
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.queryByText("アプリ内ブラウザではログインできません")
      ).not.toBeInTheDocument();
    });

    test("デスクトップChromeの場合_バナーを表示しない", () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Act
      render(<WebViewBanner />);

      // Assert
      expect(
        screen.queryByText("アプリ内ブラウザではログインできません")
      ).not.toBeInTheDocument();
    });
  });

  describe("WV-004 URLコピー機能", () => {
    test("コピーボタンクリック時_クリップボードにURLをコピーしてボタン文言が変わる", async () => {
      // Arrange
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0;]"
      );
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      render(<WebViewBanner />);

      // Act
      fireEvent.click(screen.getByRole("button", { name: "URLをコピー" }));

      // Assert
      await screen.findByText("コピーしました");
      expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
    });
  });
});

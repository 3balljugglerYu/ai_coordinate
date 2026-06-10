/**
 * `ShareLinkButton` の単体テスト。
 *
 * posts の ShareButton から抽出した共有 UI の汎用コンポーネント。
 * - モバイル(UA判定): 直接 sharePost（シェアシート → クリップボードフォールバック）
 * - PC: ドロップダウン「リンクをコピー」「その他の方法で共有(navigator.share)」
 * - キャンセル(AbortError)は無音、成功時のみ onShared を呼ぶ
 * を、ui/dropdown-menu と lib 境界(share-post / clipboard)のモックで検証する。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockSharePost = jest.fn();
jest.mock("@/lib/share-post", () => ({
  sharePost: (...args: unknown[]) => mockSharePost(...args),
}));

const mockCopyText = jest.fn();
jest.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyText(...args),
}));

// Radix の DropdownMenu は jsdom でポインタイベントが再現しづらいため、
// 既存テスト(language-settings-menu.test.tsx)と同じくパススルーでモックする。
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="menu-root">{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" data-testid="menu-trigger">
        {children}
      </button>
    ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="menu-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
}));

import { ShareLinkButton } from "@/components/ShareLinkButton";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function setNavigator(opts: {
  userAgent: string;
  share?: ((data: ShareData) => Promise<void>) | undefined;
}) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: opts.userAgent,
  });
  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: opts.share,
  });
}

const baseMessages = {
  copyLink: "リンクをコピー",
  moreOptions: "その他の方法で共有",
  copiedTitle: "URLをコピーしました",
  errorTitle: "エラー",
  failed: "共有に失敗しました",
  webApiUnsupported: "Web Share APIがサポートされていません",
};

const mockOnShared = jest.fn();

function renderButton(
  props: Partial<React.ComponentProps<typeof ShareLinkButton>> = {},
) {
  return render(
    <ShareLinkButton
      url="https://example.com/p/1"
      messages={baseMessages}
      onShared={mockOnShared}
      {...props}
    >
      シェア
    </ShareLinkButton>,
  );
}

beforeEach(() => {
  mockToast.mockReset();
  mockSharePost.mockReset();
  mockCopyText.mockReset();
  mockOnShared.mockReset();
  mockSharePost.mockResolvedValue({ method: "share" });
  mockCopyText.mockResolvedValue(undefined);
});

afterEach(() => {
  setNavigator({ userAgent: DESKTOP_UA, share: undefined });
});

describe("ShareLinkButton (モバイル)", () => {
  beforeEach(() => {
    setNavigator({ userAgent: MOBILE_UA, share: undefined });
  });

  test("クリックで sharePost に URL を渡し、share 完結時はトーストなしで onShared('share') を呼ぶ", async () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "シェア" }));

    await waitFor(() => {
      expect(mockSharePost).toHaveBeenCalledWith("https://example.com/p/1");
    });
    await waitFor(() => {
      expect(mockOnShared).toHaveBeenCalledWith("share");
    });
    expect(mockToast).not.toHaveBeenCalled();
    // モバイルはメニューを出さない
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  test("クリップボードフォールバック時は copied トーストと onShared('clipboard')", async () => {
    mockSharePost.mockResolvedValueOnce({ method: "clipboard" });
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "シェア" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "URLをコピーしました" }),
      );
    });
    expect(mockOnShared).toHaveBeenCalledWith("clipboard");
  });

  test("url が関数の場合は render 時でなくクリック時に評価される", async () => {
    const urlFn = jest.fn(() => "https://example.com/late");
    renderButton({ url: urlFn });

    expect(urlFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "シェア" }));

    await waitFor(() => {
      expect(mockSharePost).toHaveBeenCalledWith("https://example.com/late");
    });
    expect(urlFn).toHaveBeenCalledTimes(1);
  });

  test("進行中の再クリックでは sharePost を二重実行しない", async () => {
    let resolveShare: () => void = () => {};
    mockSharePost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveShare = () => resolve({ method: "share" });
        }),
    );
    renderButton();
    const button = screen.getByRole("button", { name: "シェア" });

    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    fireEvent.click(button);
    expect(mockSharePost).toHaveBeenCalledTimes(1);

    resolveShare();
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    expect(mockSharePost).toHaveBeenCalledTimes(1);
  });

  test("AbortError(ユーザーキャンセル)は無音: トーストも onShared もなし", async () => {
    mockSharePost.mockRejectedValueOnce(
      new DOMException("cancelled", "AbortError"),
    );
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "シェア" }));

    // 共有は試行されたうえでキャンセルされたこと(素通り防止のアンカー)
    await waitFor(() => {
      expect(mockSharePost).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "シェア" })).toBeEnabled();
    });
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockOnShared).not.toHaveBeenCalled();
  });

  test("非 Abort の失敗は destructive トースト(詳細メッセージ入り)で onShared なし", async () => {
    mockSharePost.mockRejectedValueOnce(new Error("net dead"));
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "シェア" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "エラー",
          description: "net dead",
          variant: "destructive",
        }),
      );
    });
    expect(mockOnShared).not.toHaveBeenCalled();
  });

  test("非 Error 値の reject は failed 固定文言のトースト", async () => {
    mockSharePost.mockRejectedValueOnce("boom");
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "シェア" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "エラー",
          description: "共有に失敗しました",
          variant: "destructive",
        }),
      );
    });
    expect(mockOnShared).not.toHaveBeenCalled();
  });
});

describe("ShareLinkButton (PC)", () => {
  beforeEach(() => {
    setNavigator({ userAgent: DESKTOP_UA, share: undefined });
  });

  test("「リンクをコピー」で URL をコピーし copied トーストと onShared('clipboard')", async () => {
    renderButton();

    fireEvent.click(screen.getByRole("menuitem", { name: "リンクをコピー" }));

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith("https://example.com/p/1");
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "URLをコピーしました" }),
      );
    });
    expect(mockOnShared).toHaveBeenCalledWith("clipboard");
    // PC のコピーは sharePost を経由しない
    expect(mockSharePost).not.toHaveBeenCalled();
  });

  test("「その他の方法で共有」で navigator.share を直接呼び onShared('share')", async () => {
    const navigatorShare = jest.fn().mockResolvedValue(undefined);
    setNavigator({ userAgent: DESKTOP_UA, share: navigatorShare });
    renderButton();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "その他の方法で共有" }),
    );

    await waitFor(() => {
      expect(navigatorShare).toHaveBeenCalledWith({
        title: "Persta.AI",
        url: "https://example.com/p/1",
      });
    });
    await waitFor(() => {
      expect(mockOnShared).toHaveBeenCalledWith("share");
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  test("「その他の方法で共有」の AbortError は無音", async () => {
    const navigatorShare = jest
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    setNavigator({ userAgent: DESKTOP_UA, share: navigatorShare });
    renderButton();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "その他の方法で共有" }),
    );

    await waitFor(() => {
      expect(navigatorShare).toHaveBeenCalledTimes(1);
    });
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockOnShared).not.toHaveBeenCalled();
  });

  test("「その他の方法で共有」の非 Error reject は failed 固定文言のトースト", async () => {
    const navigatorShare = jest.fn().mockRejectedValue("boom");
    setNavigator({ userAgent: DESKTOP_UA, share: navigatorShare });
    renderButton();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "その他の方法で共有" }),
    );

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "エラー",
          description: "共有に失敗しました",
          variant: "destructive",
        }),
      );
    });
    expect(mockOnShared).not.toHaveBeenCalled();
  });

  test("コピー進行中はトリガーが disabled になり menu item の二重実行もしない", async () => {
    let resolveCopy: () => void = () => {};
    mockCopyText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    renderButton();
    const trigger = screen.getByRole("button", { name: "シェア" });
    const copyItem = screen.getByRole("menuitem", { name: "リンクをコピー" });

    fireEvent.click(copyItem);
    await waitFor(() => {
      expect(trigger).toBeDisabled();
    });

    fireEvent.click(copyItem);
    expect(mockCopyText).toHaveBeenCalledTimes(1);

    resolveCopy();
    await waitFor(() => {
      expect(trigger).toBeEnabled();
    });
    expect(mockCopyText).toHaveBeenCalledTimes(1);
  });

  test("コピー失敗は destructive トースト(固定文言)で onShared なし", async () => {
    mockCopyText.mockRejectedValueOnce(new Error("clipboard denied"));
    renderButton();

    fireEvent.click(screen.getByRole("menuitem", { name: "リンクをコピー" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "エラー",
          description: "共有に失敗しました",
          variant: "destructive",
        }),
      );
    });
    expect(mockOnShared).not.toHaveBeenCalled();
  });

  test("Web Share 進行中はトリガーが disabled になり menu item の二重実行もしない", async () => {
    let resolveShare: () => void = () => {};
    const navigatorShare = jest.fn().mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveShare = resolve;
        }),
    );
    setNavigator({ userAgent: DESKTOP_UA, share: navigatorShare });
    renderButton();
    const trigger = screen.getByRole("button", { name: "シェア" });
    const moreItem = screen.getByRole("menuitem", {
      name: "その他の方法で共有",
    });

    fireEvent.click(moreItem);
    await waitFor(() => {
      expect(trigger).toBeDisabled();
    });

    fireEvent.click(moreItem);
    expect(navigatorShare).toHaveBeenCalledTimes(1);

    resolveShare();
    await waitFor(() => {
      expect(trigger).toBeEnabled();
    });
    expect(navigatorShare).toHaveBeenCalledTimes(1);
  });

  test("navigator 自体が無い環境(SSR 相当)では PC メニュー側として描画する", () => {
    const originalNavigator = window.navigator;
    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: undefined,
    });
    try {
      renderButton();
      expect(
        screen.getByRole("menuitem", { name: "リンクをコピー" }),
      ).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  test("navigator.share 未対応で「その他の方法で共有」は webApiUnsupported のトースト", async () => {
    setNavigator({ userAgent: DESKTOP_UA, share: undefined });
    renderButton();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "その他の方法で共有" }),
    );

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "エラー",
          description: "Web Share APIがサポートされていません",
          variant: "destructive",
        }),
      );
    });
    expect(mockOnShared).not.toHaveBeenCalled();
  });
});

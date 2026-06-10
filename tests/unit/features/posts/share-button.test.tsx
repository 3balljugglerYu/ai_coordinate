/**
 * posts `ShareButton` の characterization テスト。
 *
 * ShareLinkButton への共通化リファクタの前後で、投稿シェアの観測可能な挙動
 * （モバイル=sharePost 直呼び / PC=メニューからコピー・Web Share、文言、
 * エラートースト）が変わらないことを担保する。リファクタ前の実装でも
 * 後の実装でも緑であること。
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

const mockGetPostDetailUrl = jest.fn(
  () => "https://persta.ai/ja/posts/post-1",
);
jest.mock("@/lib/url-utils", () => ({
  getPostDetailUrl: (...args: unknown[]) => mockGetPostDetailUrl(...args),
}));

// posts 名前空間の実文言をピン留めする(キー素通しだと文言回帰を検知できない)
const POSTS_JA: Record<string, string> = {
  shareCopyLink: "リンクをコピー",
  shareMoreOptions: "その他の方法で共有",
  shareCopyTitle: "URLをコピーしました",
  errorTitle: "エラー",
  shareFailed: "共有に失敗しました",
  shareWebApiUnsupported: "Web Share APIがサポートされていません",
};
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => POSTS_JA[key] ?? key,
  useLocale: () => "ja",
}));

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

import { ShareButton } from "@/features/posts/components/ShareButton";

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

beforeEach(() => {
  mockToast.mockReset();
  mockSharePost.mockReset();
  mockCopyText.mockReset();
  mockGetPostDetailUrl.mockClear();
  mockSharePost.mockResolvedValue({ method: "share" });
  mockCopyText.mockResolvedValue(undefined);
});

afterEach(() => {
  setNavigator({ userAgent: DESKTOP_UA, share: undefined });
});

describe("ShareButton (characterization)", () => {
  test("モバイル: クリックで投稿詳細URLを sharePost に渡す", async () => {
    setNavigator({ userAgent: MOBILE_UA, share: undefined });
    render(<ShareButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockSharePost).toHaveBeenCalledWith(
        "https://persta.ai/ja/posts/post-1",
      );
    });
    expect(mockGetPostDetailUrl).toHaveBeenCalledWith("post-1", "ja");
  });

  test("PC: 「リンクをコピー」で URL コピーと copied トースト", async () => {
    setNavigator({ userAgent: DESKTOP_UA, share: undefined });
    render(<ShareButton postId="post-1" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "リンクをコピー" }));

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith(
        "https://persta.ai/ja/posts/post-1",
      );
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "URLをコピーしました" }),
      );
    });
  });

  test("PC: コピー失敗は固定文言「共有に失敗しました」の destructive トースト", async () => {
    setNavigator({ userAgent: DESKTOP_UA, share: undefined });
    mockCopyText.mockRejectedValueOnce(new Error("clipboard denied"));
    render(<ShareButton postId="post-1" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "リンクをコピー" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "エラー",
          // 現行実装はコピー失敗時 error.message でなく固定文言を出す
          description: "共有に失敗しました",
          variant: "destructive",
        }),
      );
    });
  });

  test("PC: navigator.share 未対応時の「その他の方法で共有」はエラートースト", async () => {
    setNavigator({ userAgent: DESKTOP_UA, share: undefined });
    render(<ShareButton postId="post-1" />);

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
  });
});

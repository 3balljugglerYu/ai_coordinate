/**
 * `MountShareButton` の UI レイヤテスト。
 *
 * - 「画像を保存」: モバイル/PC 分岐・Web Share・DL フォールバックは共通ヘルパ側の
 *   `download-image.test.ts` で網羅済み。ここでは委譲・失敗トースト・busy を検証。
 * - 「台紙をシェアする」: posts と同じ共通コンポーネント `ShareLinkButton` を
 *   実体のまま使い（メニュー部の ui/dropdown-menu はパススルーモック）、
 *   PC メニューからのコピー・計測(trackMountShareEvent)・未対応エラーを検証。
 *   コンポーネント自体の振る舞いは share-link-button.test.tsx で網羅済み。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockShareOrDownload = jest.fn();
jest.mock("@/features/generation/lib/download-image", () => ({
  shareOrDownloadGeneratedImage: (...args: unknown[]) =>
    mockShareOrDownload(...args),
}));

const mockBuildPublicMountUrl = jest.fn(
  () => "https://persta.ai/m/completion-1?v=123",
);
const mockTrackMountShareEvent = jest.fn();
jest.mock("@/features/collections/lib/share-mount", () => ({
  buildPublicMountUrl: (...args: unknown[]) => mockBuildPublicMountUrl(...args),
  trackMountShareEvent: (...args: unknown[]) =>
    mockTrackMountShareEvent(...args),
}));

const mockSharePost = jest.fn();
jest.mock("@/lib/share-post", () => ({
  sharePost: (...args: unknown[]) => mockSharePost(...args),
}));

const mockCopyText = jest.fn();
jest.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyText(...args),
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

import { MountShareButton } from "@/features/collections/components/MountShareButton";

const defaultProps = {
  completionId: "completion-1",
  mountImageUrl: "https://example.com/mounts/mount-1717999999999.png",
};

beforeEach(() => {
  mockToast.mockReset();
  mockShareOrDownload.mockReset();
  mockBuildPublicMountUrl.mockClear();
  mockTrackMountShareEvent.mockReset();
  mockSharePost.mockReset();
  mockCopyText.mockReset();
  mockShareOrDownload.mockResolvedValue(undefined);
  mockCopyText.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: undefined,
  });
});

describe("MountShareButton: 画像を保存", () => {
  test("クリックで共通ヘルパに completionId と画像URL・リストタブ同等の文言を渡す", async () => {
    render(<MountShareButton {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "画像を保存" }));

    await waitFor(() => {
      expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
    });
    expect(mockShareOrDownload).toHaveBeenCalledWith(
      { id: "completion-1", url: defaultProps.mountImageUrl },
      expect.objectContaining({
        // accessDenied はヘルパが Error message としてそのままトーストに出す
        // ユーザー向けコピーなので、リストタブ(ja)と同一文言をピン留めする
        accessDenied:
          "画像へのアクセス権限がありません。認証が必要な可能性があります。",
        fetchFailed: expect.any(Function),
      }),
    );
    // fetchFailed はステータステキスト入りのリストタブ(ja)同等文言を返すこと
    const messages = mockShareOrDownload.mock.calls[0][1] as {
      fetchFailed: (statusText: string) => string;
    };
    expect(messages.fetchFailed("Not Found")).toBe(
      "画像の取得に失敗しました: Not Found",
    );
    // 成功時はリストタブ同様トーストを出さない（モバイル share はシェアシートで完結）
    expect(mockToast).not.toHaveBeenCalled();
  });

  test("DL中は保存ボタンのみ disabled になり二重実行しない(シェアとは独立)", async () => {
    let resolveDownload: () => void = () => {};
    mockShareOrDownload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );

    render(<MountShareButton {...defaultProps} />);
    const downloadButton = screen.getByRole("button", { name: "画像を保存" });
    const shareTrigger = screen.getByRole("button", {
      name: "台紙をシェアする",
    });

    fireEvent.click(downloadButton);
    await waitFor(() => {
      expect(downloadButton).toBeDisabled();
    });
    // posts と同じ独立 busy: DL 中でもシェア操作は塞がない
    expect(shareTrigger).toBeEnabled();

    fireEvent.click(downloadButton);
    expect(mockShareOrDownload).toHaveBeenCalledTimes(1);

    resolveDownload();
    await waitFor(() => {
      expect(downloadButton).toBeEnabled();
    });
    // 解決後も遅延実行された二重呼び出しが無いこと
    expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
  });

  test("失敗時（Error）は destructive トーストを出し window.open は呼ばず再有効化する", async () => {
    mockShareOrDownload.mockRejectedValueOnce(new Error("fetch dead"));
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(<MountShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "画像を保存" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "fetch dead",
          variant: "destructive",
        }),
      );
    });
    // 旧実装の window.open フォールバックが廃止されていること
    expect(openSpy).not.toHaveBeenCalled();
    // リストタブと同じくエラーはログに残す
    expect(errorSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "画像を保存" }),
      ).toBeEnabled();
    });

    openSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("失敗時（非 Error 値）は固定文言の destructive トーストを出す", async () => {
    mockShareOrDownload.mockRejectedValueOnce("boom");
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(<MountShareButton {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "画像を保存" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "画像のダウンロードに失敗しました",
          variant: "destructive",
        }),
      );
    });

    errorSpy.mockRestore();
  });
});

describe("MountShareButton: 台紙をシェアする (PC, posts と同一挙動)", () => {
  // jsdom の既定 UA はデスクトップ扱いなので PC メニュー経路になる

  test("「リンクをコピー」で公開URLをコピーし copied トーストと share-event 計測", async () => {
    render(<MountShareButton {...defaultProps} />);

    fireEvent.click(screen.getByRole("menuitem", { name: "リンクをコピー" }));

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith(
        "https://persta.ai/m/completion-1?v=123",
      );
    });
    expect(mockBuildPublicMountUrl).toHaveBeenCalledWith(
      "completion-1",
      defaultProps.mountImageUrl,
    );
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "URLをコピーしました" }),
      );
    });
    expect(mockTrackMountShareEvent).toHaveBeenCalledWith("completion-1");
  });

  test("「リンクをコピー」失敗時は固定文言の destructive トーストで計測なし", async () => {
    mockCopyText.mockRejectedValueOnce(new Error("clipboard denied"));

    render(<MountShareButton {...defaultProps} />);

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
    expect(mockTrackMountShareEvent).not.toHaveBeenCalled();
  });

  test("navigator.share 未対応時の「その他の方法で共有」はエラートーストで計測なし", async () => {
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: undefined,
    });

    render(<MountShareButton {...defaultProps} />);

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
    expect(mockTrackMountShareEvent).not.toHaveBeenCalled();
  });
});

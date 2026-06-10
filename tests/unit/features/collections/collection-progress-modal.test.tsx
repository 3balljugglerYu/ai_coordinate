/**
 * `CollectionProgressModal` 完了ビューのシェア導線テスト。
 *
 * シェアは posts / /m と同じ汎用 ShareLinkButton(実体)を使う。
 * コンポーネント自体の振る舞いは share-link-button.test.tsx で網羅済みのため、
 * ここでは配線(URL組立・計測・表示条件)と「シェアページへ」リンクの回帰を検証する。
 * Dialog は実体(Radix)、DropdownMenu は既存規約どおりパススルーでモックする。
 * 画像ロード前(ready=false)は opacity:0 になるだけで DOM には存在するため、
 * クエリ・クリックはロード完了を待たずに行える。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockCopyText = jest.fn();
jest.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyText(...args),
}));

const mockSharePost = jest.fn();
jest.mock("@/lib/share-post", () => ({
  sharePost: (...args: unknown[]) => mockSharePost(...args),
}));

const mockBuildPublicMountUrl = jest.fn(
  () => "https://persta.ai/m/completion-1?v=42",
);
const mockTrackMountShareEvent = jest.fn();
jest.mock("@/features/collections/lib/share-mount", () => ({
  buildPublicMountUrl: (...args: unknown[]) => mockBuildPublicMountUrl(...args),
  trackMountShareEvent: (...args: unknown[]) =>
    mockTrackMountShareEvent(...args),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
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

import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";

const completedCelebration: CollectionCelebration = {
  categoryKey: "collectible_wafer_sticker",
  displayName: "うちの子",
  fromCount: 4,
  toCount: 4,
  threshold: 4,
  isCompleted: true,
  mountImageUrl: "https://cdn.example.com/mounts/mount-42.png",
  sharePath: "/m/completion-1",
  completionId: "completion-1",
  characterImageUrl: null,
  collectedImageUrls: [],
};

function renderModal(celebration: CollectionCelebration) {
  return render(
    <CollectionProgressModal
      open
      celebration={celebration}
      onClose={jest.fn()}
    />,
  );
}

beforeEach(() => {
  mockToast.mockReset();
  mockCopyText.mockReset();
  mockSharePost.mockReset();
  mockBuildPublicMountUrl.mockClear();
  mockTrackMountShareEvent.mockReset();
  mockCopyText.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: undefined,
  });
});

describe("CollectionProgressModal: 完了ビューのシェア (PC)", () => {
  test("「リンクをコピー」で公開URLをコピーし copied トーストと share-event 計測", async () => {
    renderModal(completedCelebration);

    fireEvent.click(screen.getByRole("menuitem", { name: "リンクをコピー" }));

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith(
        "https://persta.ai/m/completion-1?v=42",
      );
    });
    expect(mockBuildPublicMountUrl).toHaveBeenCalledWith(
      "completion-1",
      completedCelebration.mountImageUrl,
    );
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "URLをコピーしました" }),
      );
    });
    expect(mockTrackMountShareEvent).toHaveBeenCalledWith("completion-1");
  });

  test("「シェアページへ」リンクは従来どおり sharePath へ遷移する(回帰)", () => {
    renderModal(completedCelebration);

    const link = screen.getByRole("link", { name: "シェアページへ" });
    expect(link).toHaveAttribute("href", "/m/completion-1");
  });

  test("completionId が null ならシェアメニューを出さない", () => {
    renderModal({
      ...completedCelebration,
      completionId: null,
      sharePath: null,
    });

    // 台紙ビュー自体は出る(台紙画像)が、シェア導線は無い
    // ※「コンプリート！」は sr-only タイトルと h2 の2箇所にあるため
    //   一意な台紙画像 alt をアンカーにする
    expect(
      screen.getByAltText("うちの子 コンプリート台紙"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "台紙をシェアする" }),
    ).not.toBeInTheDocument();
  });

  test("navigator.share 未対応時の「その他の方法で共有」はエラートーストで計測なし", async () => {
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: undefined,
    });

    renderModal(completedCelebration);

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

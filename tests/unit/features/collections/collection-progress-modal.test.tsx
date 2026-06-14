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

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  default: (props: {
    src: string;
    alt: string;
    onLoad?: () => void;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt={props.alt}
      onLoad={props.onLoad}
      onError={props.onError}
    />
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
  // ready=true で進捗アニメ effect が走ると matchMedia を参照するため、jsdom 用にモック。
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }) as unknown as typeof window.matchMedia;
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

describe("CollectionProgressModal: クラッカー(confetti)演出の表示条件", () => {
  // レイアウト未定義カテゴリ + mount画像なしにすると totalImages=0 で
  // ready が即 true になり、画像ロードを待たずに confetti の表示判定を検証できる。
  const baseProgress: CollectionCelebration = {
    categoryKey: "no_layout_category",
    displayName: "うちの子",
    fromCount: 0,
    toCount: 0,
    threshold: 4,
    isCompleted: false,
    mountImageUrl: null,
    sharePath: null,
    completionId: null,
    characterImageUrl: null,
    collectedImageUrls: [],
  };

  // 非表示の検証は同期的に確定する(confetti の show は ready/effect/完了状態の
  // 同期計算)。waitFor + queryBy で「非存在」を待つのは、即 null が返り1回目で
  // 必ずパスしてしまうアンチパターンなので、同期アサートする。
  test("未完了(0%)ではクラッカーを表示しない", () => {
    renderModal({ ...baseProgress, isCompleted: false, toCount: 0 });

    expect(
      screen.queryByTestId("collection-confetti"),
    ).not.toBeInTheDocument();
  });

  test("未完了(途中)でもクラッカーを表示しない", () => {
    renderModal({
      ...baseProgress,
      isCompleted: false,
      fromCount: 1,
      toCount: 2,
    });

    expect(
      screen.queryByTestId("collection-confetti"),
    ).not.toBeInTheDocument();
  });

  test("完了時(effect未指定=confettiデフォルト)はクラッカーを表示する", async () => {
    renderModal({
      ...baseProgress,
      isCompleted: true,
      fromCount: 4,
      toCount: 4,
    });

    expect(
      await screen.findByTestId("collection-confetti"),
    ).toBeInTheDocument();
  });

  test("完了でも celebrationEffect='sparkle' ならクラッカーは出さない", () => {
    renderModal({
      ...baseProgress,
      isCompleted: true,
      fromCount: 4,
      toCount: 4,
      celebrationEffect: "sparkle",
    });

    expect(
      screen.queryByTestId("collection-confetti"),
    ).not.toBeInTheDocument();
  });
});

describe("CollectionProgressModal: ready ゲートのデッドロック防止", () => {
  // god_6p レイアウト(6スロット)で進捗ビューを出す celebration。
  // collectedImageUrls に欠け(null)を混ぜ、描画される <Image> 数と totalImages が
  // 一致して ready に到達できることを検証する。
  const layoutProgress = (
    collectedImageUrls: (string | null)[],
    toCount: number,
  ): CollectionCelebration => ({
    categoryKey: "collectible_wafer_sticker_god_6p",
    displayName: "神コレ",
    fromCount: 0,
    toCount,
    threshold: 6,
    isCompleted: false,
    mountImageUrl: null,
    sharePath: null,
    completionId: null,
    characterImageUrl: null,
    collectedImageUrls: collectedImageUrls as string[],
  });

  test("collectedImageUrls に欠けがあっても、描画画像のロードで ready になり表示される", () => {
    // 5枚集めたが index 2 が欠け(null)→ 実際に描画されるシールは4枚 + 土台frame = 5枚。
    renderModal(layoutProgress(["a", "b", null, "d", "e"], 5));

    // 初期はロード未完で「準備中…」スピナーが出る。
    expect(screen.getByLabelText("読み込み中")).toBeInTheDocument();

    // 描画されている全画像の onLoad を発火（Dialog は Portal なので document から取得。
    // alt="" のため role img では取れない）。
    document.querySelectorAll("img").forEach((img) => fireEvent.load(img));

    // totalImages が実描画枚数と一致するため ready に到達 → スピナーが消える。
    expect(screen.queryByLabelText("読み込み中")).not.toBeInTheDocument();
  });

  test("画像ロードが完了しなくても、タイムアウトで強制表示される(保険)", () => {
    jest.useFakeTimers();
    try {
      // onLoad を一切発火させない → 通常なら ready に到達できないケース。
      renderModal(layoutProgress(["a", "b", "c", "d", "e"], 5));

      expect(screen.getByLabelText("読み込み中")).toBeInTheDocument();

      // READY_TIMEOUT_MS(3500ms) 経過で forceReady → 表示。
      act(() => {
        jest.advanceTimersByTime(3500);
      });

      expect(
        screen.queryByLabelText("読み込み中"),
      ).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("CollectionProgressModal: 完了時の紙吹雪は画像ロードを待たない", () => {
  // 完了モーダル(台紙画像あり)。画像 onLoad を発火させず ready=false のまま。
  const completedConfetti: CollectionCelebration = {
    categoryKey: "collectible_wafer_sticker_god_6p",
    displayName: "神コレ",
    fromCount: 0,
    toCount: 6,
    threshold: 6,
    isCompleted: true,
    mountImageUrl: "https://cdn.example.com/mount.png",
    sharePath: "/m/c-1",
    completionId: "c-1",
    characterImageUrl: null,
    collectedImageUrls: [],
  };

  test("台紙画像がロードされず ready=false でも、フォールバックで紙吹雪が飛ぶ", () => {
    jest.useFakeTimers();
    try {
      renderModal(completedConfetti);

      // 台紙画像 onLoad を発火させない → ready=false（準備中スピナー表示）。
      expect(screen.getByLabelText("読み込み中")).toBeInTheDocument();
      // この時点ではまだ armed 前。
      expect(
        screen.queryByTestId("collection-confetti"),
      ).not.toBeInTheDocument();

      // CONFETTI_FALLBACK_MS(600ms) 経過で、ready を待たず発火する。
      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(
        screen.getByTestId("collection-confetti"),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

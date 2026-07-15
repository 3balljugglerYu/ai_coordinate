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
      screen.getByAltText("うちの子 コンプリートカード"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "カードをシェアする" }),
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

describe("CollectionProgressModal: 完了時の紙吹雪は表示(ready)後に飛ぶ", () => {
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

  test("準備中(ready=false)の間は紙吹雪を出さず、ready保険の到達後に飛ぶ", () => {
    jest.useFakeTimers();
    try {
      renderModal(completedConfetti);

      // 台紙画像 onLoad を発火させない → ready=false（準備中スピナー表示）。
      expect(screen.getByLabelText("読み込み中")).toBeInTheDocument();

      // 準備中の間は発火しない(600ms 経過してもまだ)。
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(
        screen.queryByTestId("collection-confetti"),
      ).not.toBeInTheDocument();

      // READY_TIMEOUT_MS(3500ms) の保険で forceReady→ready になる。
      // (この時点で ready 後の紙吹雪タイマーが仕込まれる)
      act(() => {
        jest.advanceTimersByTime(3500);
      });
      // ready 後の遅延(CONFETTI_AFTER_READY_MS=250ms)経過で発火する。
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(
        screen.getByTestId("collection-confetti"),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("CollectionProgressModal: DB 駆動レイアウト(progressModal* 設定)", () => {
  // admin が設定する DB 駆動レイアウト。frameUrl+実寸がそろっているので
  // MODAL_LAYOUTS より優先され、centerRect から ring/badge を自動導出する。
  const dbProgress = (
    overrides: Partial<CollectionCelebration> = {},
  ): CollectionCelebration => ({
    categoryKey: "db_driven_category",
    displayName: "DB駆動",
    fromCount: 0,
    toCount: 2,
    threshold: 6,
    isCompleted: false,
    mountImageUrl: null,
    sharePath: null,
    completionId: null,
    characterImageUrl: "CHAR",
    collectedImageUrls: ["S1", "S2"],
    progressModalFrameUrl: "https://cdn.example.com/frames/frame-1.webp",
    progressModalFrameWidth: 1086,
    progressModalFrameHeight: 1448,
    progressModalSlots: [
      { x: 0.1, y: 0.7, w: 0.13, h: 0.13 },
      { x: 0.3, y: 0.7, w: 0.13, h: 0.13 },
    ],
    progressModalButton: { x: 0.1, y: 0.85, w: 0.8, h: 0.09 },
    progressModalCenter: { x: 0.3, y: 0.2, w: 0.4, h: 0.3 },
    ...overrides,
  });

  test("DB 色設定あり: フレーム/中央/スロット画像 + リング/バッジ/%文字に指定色を反映", () => {
    render(
      <CollectionProgressModal
        open
        celebration={dbProgress({
          progressModalRingColor: "#22C55E",
          progressModalBadgeColor: "#16A34A",
          progressModalBadgeTextColor: "#FFFFFF",
          progressModalBadgeBgColor: "#166534",
        })}
        onClose={jest.fn()}
      />,
    );

    const imgSrcs = Array.from(document.querySelectorAll("img")).map(
      (img) => img.getAttribute("src") ?? "",
    );
    // フレーム / 中央キャラ / 集めたシール(S1/S2)が描画される
    expect(
      imgSrcs.some((src) => src.includes("frame-1.webp")),
    ).toBe(true);
    expect(imgSrcs).toContain("CHAR");
    expect(imgSrcs).toContain("S1");
    expect(imgSrcs).toContain("S2");

    // 進捗アークの circle に ringColor が反映される
    const arcStrokes = Array.from(
      document.querySelectorAll("svg circle"),
    ).map((c) => c.getAttribute("stroke"));
    expect(arcStrokes).toContain("#22C55E");

    // バッジ外側 polygon=badgeColor、内側 polygon=badgeBgColor
    const polygonFills = Array.from(
      document.querySelectorAll("polygon"),
    ).map((p) => p.getAttribute("fill"));
    expect(polygonFills).toContain("#16A34A");
    expect(polygonFills).toContain("#166534");

    // % 文字に badgeTextColor が反映される
    const textFills = Array.from(document.querySelectorAll("text")).map((t) =>
      t.getAttribute("fill"),
    );
    expect(textFills).toContain("#FFFFFF");
  });

  test("DB 色設定なし(null): リング/バッジ/%文字は従来デフォルト配色になる", () => {
    render(
      <CollectionProgressModal
        open
        celebration={dbProgress({
          progressModalRingColor: null,
          progressModalBadgeColor: null,
          progressModalBadgeTextColor: null,
          progressModalBadgeBgColor: null,
        })}
        onClose={jest.fn()}
      />,
    );

    // フレームは DB 駆動のまま描画される(色だけデフォルト)
    const imgSrcs = Array.from(document.querySelectorAll("img")).map(
      (img) => img.getAttribute("src") ?? "",
    );
    expect(
      imgSrcs.some((src) => src.includes("frame-1.webp")),
    ).toBe(true);

    // 進捗アークはグラデーション参照(デフォルト)
    const arcStrokes = Array.from(
      document.querySelectorAll("svg circle"),
    ).map((c) => c.getAttribute("stroke"));
    expect(arcStrokes).toContain("url(#collArc)");

    // バッジ外側はゴールドのグラデ参照(デフォルト)
    const polygonFills = Array.from(
      document.querySelectorAll("polygon"),
    ).map((p) => p.getAttribute("fill"));
    expect(polygonFills).toContain("url(#badgeStroke)");

    // % 文字はオレンジ #F97316(デフォルト)
    const textFills = Array.from(document.querySelectorAll("text")).map((t) =>
      t.getAttribute("fill"),
    );
    expect(textFills).toContain("#F97316");
  });
});

describe("CollectionProgressModal: 達成後 CTA の文言と配色", () => {
  // 達成(N種到達)・カード未作成(mountImageUrl=null → showMount=false)の進捗ビュー。
  const createState: CollectionCelebration = {
    categoryKey: "collectible_wafer_sticker_god_petit_6p",
    displayName: "ぷち神",
    fromCount: 6,
    toCount: 6,
    threshold: 6,
    isCompleted: false,
    mountImageUrl: null,
    sharePath: null,
    completionId: null,
    characterImageUrl: null,
    collectedImageUrls: ["u0", "u1", "u2", "u3", "u4", "u5"],
    // DB 駆動台座(フレーム画像 + ボタン領域 + admin ボタン色)
    progressModalFrameUrl: "https://cdn.example.com/frames/petit.webp",
    progressModalFrameWidth: 1086,
    progressModalFrameHeight: 1448,
    progressModalButton: { x: 0.1, y: 0.85, w: 0.8, h: 0.09 },
    progressModalButtonColor: "#C670FF",
    progressModalButtonTextColor: "#FFFFFF",
  };

  test("達成・カード未作成: CTAは「コンプリート！ →」で admin色反映、押下でカード生成が呼ばれる", () => {
    const onCreateMount = jest.fn();
    render(
      <CollectionProgressModal
        open
        celebration={createState}
        onClose={jest.fn()}
        onCreateMount={onCreateMount}
      />,
    );
    const btn = screen.getByRole("button", { name: "コンプリート！" });
    expect(btn).toHaveTextContent("コンプリート！ →");
    // admin 設定のボタン色が inline style に入る(jsdom は rgb 形式で直列化する)
    expect(btn.getAttribute("style")).toContain(
      "background-color: rgb(198, 112, 255)",
    );
    expect(btn.getAttribute("style")).toContain("color: rgb(255, 255, 255)");
    // 押下で onCreateMount(=カード生成)が発火する
    fireEvent.click(btn);
    expect(onCreateMount).toHaveBeenCalledTimes(1);
  });

  test("ボタン領域(progress_modal_button)未設定でも CTA はフレーム下に表示され押下で発火", () => {
    const { progressModalButton, ...noButtonArea } = createState;
    void progressModalButton; // 未使用(意図的に除外)
    const onCreateMount = jest.fn();
    render(
      <CollectionProgressModal
        open
        celebration={noButtonArea as CollectionCelebration}
        onClose={jest.fn()}
        onCreateMount={onCreateMount}
      />,
    );
    // buttonRect が無くても(buttonBox=0)、フレーム下に通常配置で CTA が出る
    const btn = screen.getByRole("button", { name: "コンプリート！" });
    expect(btn).toHaveTextContent("コンプリート！ →");
    fireEvent.click(btn);
    expect(onCreateMount).toHaveBeenCalledTimes(1);
  });

  test("達成前(未コンプリート)・ボタン領域あり: 「シールを生成する」が文字付きで表示され /style へ", () => {
    render(
      <CollectionProgressModal
        open
        celebration={{ ...createState, fromCount: 0, toCount: 2 }}
        onClose={jest.fn()}
        onCreateMount={jest.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "シールを生成する" });
    expect(link).toHaveAttribute("href", "/style");
    // 透明ではなく文字が表示される(達成前で何も見えない不具合の回帰防止)
    expect(link).toHaveTextContent("シールを生成する");
    // admin のボタン色が反映される
    expect(link.getAttribute("style")).toContain(
      "background-color: rgb(198, 112, 255)",
    );
  });

  test("達成前(未コンプリート)・ボタン領域なし: フレーム下に「シールを生成する」リンク(/style)", () => {
    const { progressModalButton, ...noButtonArea } = createState;
    void progressModalButton;
    render(
      <CollectionProgressModal
        open
        celebration={
          { ...noButtonArea, fromCount: 0, toCount: 2 } as CollectionCelebration
        }
        onClose={jest.fn()}
        onCreateMount={jest.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "シールを生成する" });
    expect(link).toHaveAttribute("href", "/style");
  });

  test("達成・カード作成済み(更新可): CTAは「カードを更新する →」", () => {
    render(
      <CollectionProgressModal
        open
        celebration={{ ...createState, isCompleted: true }}
        onClose={jest.fn()}
        onCreateMount={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "カードを更新する" }),
    ).toHaveTextContent("カードを更新する →");
  });

  test("admin ボタン色なし: 従来のオレンジCTA(背景色のinline指定なし)", () => {
    render(
      <CollectionProgressModal
        open
        celebration={{
          ...createState,
          progressModalButtonColor: null,
          progressModalButtonTextColor: null,
        }}
        onClose={jest.fn()}
        onCreateMount={jest.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: "コンプリート！" });
    // 塗り色未設定 → backgroundColor の inline 指定はなし(オレンジは class で付与)
    expect(btn.getAttribute("style") ?? "").not.toContain("background-color");
  });
});

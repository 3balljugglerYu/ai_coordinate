/** @jest-environment jsdom */

/**
 * `/styles` の生成シート(`StyleGenerationSheet`)の配線。
 *
 * 外側は User ORIGINAL の生成シート(`PromptLockedGenerationSheet`)と同じなので、
 * そちらのテスト(tests/unit/features/generation/prompt-locked-generation-sheet.test.tsx)
 * と同じく、重い子とダイアログをモックして配線だけを見る。
 * シートとして開くのはパソコンだけ(スマホは全画面の生成画面へ移る。2026-10-07)。
 * スマホの中身は style-generation-screen.test.tsx。
 *
 *  - 開いている間は全体の生成中バーを止め、閉じたら解除して進行中のジョブを引き継ぐ
 *  - 中身は One-Tap Style のフォーム(variant="sheet"、スタイル固定、ログイン中)
 *  - 見出し・生成結果一覧は One-Tap Style 用に切り替える
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { StyleGenerationSheet } from "@/features/style/components/StyleGenerationSheet";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const pauseMock = jest.fn();
const resumeMock = jest.fn();
const checkAndTrackMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@/features/generation/lib/generation-progress-store", () => ({
  pauseGenerationProgressBar: () => pauseMock(),
  resumeGenerationProgressBarIfNeeded: () => resumeMock(),
  checkAndTrackInProgressJob: () => checkAndTrackMock(),
}));

const availableMock = jest.fn(() => true);
jest.mock(
  "@/features/generation/components/GenerationProgressAvailabilityProvider",
  () => ({
    useGenerationProgressAvailable: () => availableMock(),
  })
);

const isDesktopMock = jest.fn(() => true);
jest.mock("@/features/generation/hooks/useIsDesktopViewport", () => ({
  useIsDesktopViewport: () => isDesktopMock(),
}));

const openScreenMock = jest.fn();
jest.mock("@/features/generation/lib/generation-screen-transition", () => ({
  isDesktopViewportNow: () => isDesktopMock(),
  openGenerationScreen: (...args: unknown[]) => openScreenMock(...args),
}));

const routerMock = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  GenerationStateProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="generation-state-provider">{children}</div>
  ),
}));

const formPropsMock = jest.fn();
jest.mock("@/features/style/components/OneTapStyleGenerationForm", () => ({
  OneTapStyleGenerationForm: (props: Record<string, unknown>) => {
    formPropsMock(props);
    return <div data-testid="form" />;
  },
}));

jest.mock(
  "@/features/generation/components/PromptLockedGenerationHeader",
  () => ({
    PromptLockedGenerationHeader: ({
      mode,
      showBalancePlaceholder,
    }: {
      mode?: string;
      showBalancePlaceholder?: boolean;
    }) => (
      <div
        data-testid="header"
        data-mode={mode ?? "free"}
        data-balance-placeholder={String(showBalancePlaceholder ?? false)}
      />
    ),
  })
);

jest.mock(
  "@/features/generation/components/PromptLockedGenerationResults",
  () => ({
    PromptLockedGenerationResults: ({
      generationType,
    }: {
      generationType?: string;
    }) => <div data-testid="results" data-generation-type={generationType ?? "free"} />,
  })
);

// Dialog(デスクトップ)は開閉の入出力だけの最小実装に差し替える。
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="dialog-root">
        <button data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          close
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

const preset = {
  id: "preset-1",
  title: "PARIS CODE",
} as unknown as StylePresetPublicSummary;

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  preset,
  subscriptionPlan: "free" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  availableMock.mockReturnValue(true);
  isDesktopMock.mockReturnValue(true);
});

describe("StyleGenerationSheet", () => {
  test("中身はスタイル固定・ログイン中のOne-Tap Styleフォーム(variant=sheet)", () => {
    render(<StyleGenerationSheet {...defaultProps} canUseFreePose />);

    expect(formPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "sheet",
        preset,
        initialAuthState: "authenticated",
        showResultPanel: false,
        subscriptionPlan: "free",
        canUseFreePose: true,
      })
    );
  });

  test("見出しと生成結果一覧をOne-Tap Style用にする", () => {
    render(<StyleGenerationSheet {...defaultProps} />);

    expect(screen.getByTestId("header")?.getAttribute("data-mode")).toBe("style");
    // 残高は読み込み前から枠とアイコンを出す(段差を出さない)
    expect(
      screen.getByTestId("header").getAttribute("data-balance-placeholder")
    ).toBe("true");
    expect(screen.getByTestId("results")?.getAttribute("data-generation-type")).toBe("one_tap_style");
    // 読み上げ用のタイトル・説明
    expect(screen.getByText("generationSheetTitle")).toBeTruthy();
    expect(screen.getByText("generationSheetDescription")).toBeTruthy();
  });

  test("開いている間は生成中バーを止め、閉じたら解除する", () => {
    const { rerender } = render(<StyleGenerationSheet {...defaultProps} />);
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(resumeMock).not.toHaveBeenCalled();

    rerender(<StyleGenerationSheet {...defaultProps} open={false} />);
    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  test("アンマウントでも生成中バーを解除する", () => {
    const { unmount } = render(<StyleGenerationSheet {...defaultProps} />);

    unmount();

    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  test("閉じると進行中のジョブを生成中バーへ引き継ぎ、onOpenChangeにも伝える", () => {
    const onOpenChange = jest.fn();

    render(<StyleGenerationSheet {...defaultProps} onOpenChange={onOpenChange} />);
    screen.getByTestId("dialog-close").click();

    expect(checkAndTrackMock).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("生成中バーが無効な間は、止めも引き継ぎもしない", () => {
    availableMock.mockReturnValue(false);
    const onOpenChange = jest.fn();

    const { unmount } = render(
      <StyleGenerationSheet {...defaultProps} onOpenChange={onOpenChange} />
    );
    screen.getByTestId("dialog-close").click();
    unmount();

    expect(pauseMock).not.toHaveBeenCalled();
    expect(checkAndTrackMock).not.toHaveBeenCalled();
    expect(resumeMock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  /*
    未ログイン(ホームの「このカタログで生成する」から、ログインなしで生成できる
    カテゴリのときだけ。2026-10-01)。/style の未ログインと同じく、結果はフォームの
    結果パネルで見せ、ログインが前提のもの(残高・生成結果一覧・生成中バー)は出さない。
  */
  describe("未ログイン", () => {
    test("フォームは未ログイン扱いで、結果はフォームの結果パネルで見せる", () => {
      render(<StyleGenerationSheet {...defaultProps} isGuest />);

      expect(formPropsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          initialAuthState: "guest",
          showResultPanel: true,
        })
      );
    });

    test("生成結果一覧と残高の枠を出さない", () => {
      render(<StyleGenerationSheet {...defaultProps} isGuest />);

      expect(screen.queryByTestId("results")).toBeNull();
      expect(
        screen.getByTestId("header").getAttribute("data-balance-placeholder")
      ).toBe("false");
    });

    test("生成中バーを止めず、閉じても引き継がない", () => {
      const onOpenChange = jest.fn();

      render(
        <StyleGenerationSheet {...defaultProps} isGuest onOpenChange={onOpenChange} />
      );
      screen.getByTestId("dialog-close").click();

      expect(pauseMock).not.toHaveBeenCalled();
      expect(checkAndTrackMock).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe("スマホは全画面の生成画面へ移る(2026-10-07)", () => {
  test("開くと生成画面へ移り、呼び出し側の open は閉じた扱いに戻す", () => {
    isDesktopMock.mockReturnValue(false);
    const onOpenChange = jest.fn();
    render(<StyleGenerationSheet {...defaultProps} onOpenChange={onOpenChange} />);
    expect(openScreenMock).toHaveBeenCalledWith(routerMock, "/generate/style/preset-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId("form")).toBeNull();
    expect(pauseMock).not.toHaveBeenCalled();
  });

  test("パソコンでは移らない", () => {
    render(<StyleGenerationSheet {...defaultProps} />);
    expect(openScreenMock).not.toHaveBeenCalled();
  });
});


/** @jest-environment jsdom */

/**
 * `PromptLockedGenerationSheet` とバックグラウンド進捗ストアの配線。
 *
 * ⭐ 呼び出し元2つは挙動が違う（PR #594 レビューで判明。当初「どちらも
 * 閉じる＝即unmount」と誤認していた）。
 *   - `FollowAndUsePromptButton`: `{isSheetOpen && ... ? (<Sheet/>) : null}`
 *     で閉じると unmount する
 *   - `SourcePromptReferenceCard`: `{canGenerate ? (<Sheet open={isSheetOpen} .../>) : null}`
 *     で `canGenerate`（投稿詳細を見ている間はずっと true）だけを見ており、
 *     閉じても unmount せず `open` prop だけが変わる
 * ライフサイクル effect は mount/unmount ではなく `open` prop の変化で
 * 判定するため、両方のパターンをテストする。
 *
 * 重い子コンポーネント（`GenerationFormContainer` 等）と vaul の `Drawer` は
 * モック化し、配線ロジックだけを検証する。モバイル経路（`Drawer`）だけを
 * 見れば十分（`handleOpenChange` とライフサイクル effect は
 * デスクトップ/モバイル共通のロジックのため）。
 */

import React from "react";
import { render } from "@testing-library/react";
import { PromptLockedGenerationSheet } from "@/features/generation/components/PromptLockedGenerationSheet";

const pauseMock = jest.fn();
const resumeMock = jest.fn();
const checkAndTrackMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@/features/generation/lib/generation-progress-store", () => ({
  pauseGenerationProgressBar: () => pauseMock(),
  resumeGenerationProgressBarIfNeeded: () => resumeMock(),
  checkAndTrackInProgressJob: () => checkAndTrackMock(),
}));

// ⭐ 既定は available(段階公開で運営に見えている状態)。false のケースは
// 専用のテストで個別に上書きする。
const availableMock = jest.fn(() => true);
jest.mock("@/features/generation/components/GenerationProgressAvailabilityProvider", () => ({
  useGenerationProgressAvailable: () => availableMock(),
}));

jest.mock("@/features/generation/hooks/useIsDesktopViewport", () => ({
  useIsDesktopViewport: () => false,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/features/posts/lib/source-prompt-text-api", () => ({
  fetchSourcePromptText: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  GenerationStateProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/features/generation/components/GenerationFormContainer", () => ({
  GenerationFormContainer: () => <div data-testid="form" />,
}));

jest.mock("@/features/generation/components/PromptLockedGenerationHeader", () => ({
  PromptLockedGenerationHeader: () => <div data-testid="header" />,
}));

jest.mock("@/features/generation/components/PromptLockedGenerationResults", () => ({
  PromptLockedGenerationResults: () => <div data-testid="results" />,
}));

// vaul の Drawer はポータル/アニメーションを持つため、開閉の入出力だけの
// 最小実装に差し替える。onOpenChange の伝播だけを検証したい。
jest.mock("vaul", () => {
  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    children: React.ReactNode;
  }) {
    return open ? (
      <div data-testid="drawer-root" data-onopenchange="attached">
        <button
          data-testid="drawer-close"
          onClick={() => onOpenChange(false)}
        >
          close
        </button>
        {children}
      </div>
    ) : null;
  }
  const Portal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const passthrough = (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  );
  return {
    Drawer: {
      Root,
      Portal,
      Overlay: passthrough,
      Content: passthrough,
      Handle: passthrough,
      Title: passthrough,
      Description: passthrough,
    },
  };
});

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  sourcePostId: "post-1",
  subscriptionPlan: "free" as const,
  promptVisibility: "private" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  availableMock.mockReturnValue(true);
});

describe("PromptLockedGenerationSheet と進捗ストアの配線", () => {
  /*
    ⭐ 段階公開: available が false のあいだは、ストア操作を一切行わない
    （本番でまず運営のみに見せるため。GenerationProgressHost 側の
    ガードだけに頼らず、ここでも二重に閉じる）。
  */
  test("段階公開でavailableがfalseなら_ストア操作を一切行わない", () => {
    availableMock.mockReturnValue(false);
    const onOpenChange = jest.fn();
    const { getByTestId, unmount } = render(
      <PromptLockedGenerationSheet {...defaultProps} onOpenChange={onOpenChange} />
    );

    expect(pauseMock).not.toHaveBeenCalled();

    getByTestId("drawer-close").click();
    expect(checkAndTrackMock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    unmount();
    expect(resumeMock).not.toHaveBeenCalled();
  });

  test("mountでバーを抑制し、unmountで解除する（FollowAndUsePromptButtonのパターン）", () => {
    const { unmount } = render(<PromptLockedGenerationSheet {...defaultProps} />);

    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(resumeMock).not.toHaveBeenCalled();

    unmount();

    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  /*
    ⭐ レビュー指摘の回帰テスト。SourcePromptReferenceCard は
    `canGenerate` だけで mount 判定するため、投稿詳細を見ている間は
    シートを閉じても unmount されず、`open` prop だけが false になる。
    mount/unmount だけで pause/resume を判定していると、この経路では
    resume が一生呼ばれず sheetOpenCount が上がったままになっていた。
  */
  test("⭐unmountせずopenのrerenderだけでも動く（SourcePromptReferenceCardのパターン）", () => {
    const { rerender } = render(
      <PromptLockedGenerationSheet {...defaultProps} open={true} />
    );
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(resumeMock).not.toHaveBeenCalled();

    // 閉じる。canGenerate は変わらないので unmount はされない想定
    // （このテストでは実際に unmount せず rerender で表現する）。
    rerender(<PromptLockedGenerationSheet {...defaultProps} open={false} />);
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(pauseMock).toHaveBeenCalledTimes(1); // 増えない

    // 同じ投稿から、もう一度開く
    rerender(<PromptLockedGenerationSheet {...defaultProps} open={true} />);
    expect(pauseMock).toHaveBeenCalledTimes(2);
    expect(resumeMock).toHaveBeenCalledTimes(1); // まだ増えない

    rerender(<PromptLockedGenerationSheet {...defaultProps} open={false} />);
    expect(resumeMock).toHaveBeenCalledTimes(2);
  });

  /*
    ⭐ 閉じる操作（つまみを下へ引く相当）で checkAndTrackInProgressJob が
    呼ばれ、かつ呼び出し元の onOpenChange にも正しく伝播すること。
  */
  test("閉じる操作でcheckAndTrackInProgressJobを呼び、onOpenChangeにも伝播する", () => {
    const onOpenChange = jest.fn();
    const { getByTestId } = render(
      <PromptLockedGenerationSheet {...defaultProps} onOpenChange={onOpenChange} />
    );

    getByTestId("drawer-close").click();

    expect(checkAndTrackMock).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

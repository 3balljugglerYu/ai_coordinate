/** @jest-environment jsdom */

/**
 * 完走報酬パネル(カウントアップ演出)の回帰テスト。
 * (docs/planning/collection-completion-reward-implementation-plan.md EARS-09)
 *
 * - 額<=0 では何も描画しない(キャップ0/付与失敗で嘘をつかない)
 * - じらし(delayMs)後にカウントが始まり、到達で「獲得！」が出る
 * - autoDismissMs 指定時は着地後に自動で消える(book没入ビュー用)
 *
 * prefers-reduced-motion を true にモックし、CountUpNumber を即着地させて
 * タイマーだけで決定的に検証する。
 */

import { act, render, screen } from "@testing-library/react";
import { CompletionRewardPanel } from "@/features/collections/components/CompletionRewardPanel";

describe("CompletionRewardPanel", () => {
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    // reduce-motion: CountUpNumber が即座に最終値へ到達し onDone を同期発火する
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    // モックを残すと同ランナー内の他テストを汚染するため元の状態へ復元する
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it("額が0以下なら何も描画しない", () => {
    const { container } = render(<CompletionRewardPanel amount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("じらし(delayMs)後にカウントし、到達で「獲得！」が表示される", () => {
    render(<CompletionRewardPanel amount={100} delayMs={800} />);

    // じらし中: パネル(ラベル)は存在するが、まだ着地していない
    expect(screen.getByText("完走報酬")).not.toBeNull();
    expect(screen.queryByText("獲得！")).toBeNull();

    act(() => {
      jest.advanceTimersByTime(800);
    });
    // 着地は rAF コールバック内で行われるため1フレーム分進める
    act(() => {
      jest.advanceTimersByTime(20);
    });

    // reduce-motion により rAF 1フレームで即着地 → 最終値と「獲得！」
    expect(screen.getByText("100")).not.toBeNull();
    expect(screen.getByText("獲得！")).not.toBeNull();
  });

  it("autoDismissMs 指定時は着地後に自動で消える", () => {
    const { container } = render(
      <CompletionRewardPanel amount={50} delayMs={100} autoDismissMs={1000} />,
    );

    act(() => {
      jest.advanceTimersByTime(100); // じらし
    });
    act(() => {
      jest.advanceTimersByTime(20); // rAF 1フレームで即着地(reduce-motion)
    });
    expect(screen.getByText("獲得！")).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1000); // 自動フェード
    });
    expect(container.firstChild).toBeNull();
  });

  it("autoDismissMs 未指定なら着地後も表示され続ける", () => {
    render(<CompletionRewardPanel amount={30} delayMs={100} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.getByText("獲得！")).not.toBeNull();
  });
});

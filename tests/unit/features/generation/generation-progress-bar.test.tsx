/** @jest-environment jsdom */

/**
 * 「このプロンプトで生成する」シートを閉じている間に画面下部へ出す、
 * 最小構成のバー(タイトル1行＋帯)。
 *
 * 表示/非表示は呼び出し元(`GenerationProgressHost`)が mount/unmount で
 * 切り替えるため、このコンポーネント自身は `visible` を持たない。
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { GenerationProgressBar } from "@/features/generation/components/GenerationProgressBar";

const COPY: Record<string, string> = {
  generatingStatusTitle: "画像を生成中...",
};

// ⭐ 本物の next-intl の t は安定した参照を返す(generation-progress-host.test.tsx と同じ理由)。
const tStable = (key: string) => COPY[key] ?? key;
jest.mock("next-intl", () => ({
  useTranslations: () => tStable,
}));

/** rAF を同期実行して「次のフレーム」を進める。 */
function flushAnimationFrame() {
  act(() => {
    jest.advanceTimersByTime(20);
  });
}

function fill(): HTMLElement {
  const track = screen.getByRole("status").querySelector(".bg-slate-200");
  return track?.firstElementChild as HTMLElement;
}

describe("GenerationProgressBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // jsdom の rAF は fake timers 配下で setTimeout に載る
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /*
    ⭐ ボトムナビ(z-50)より奥のレイヤーに敷く(z-40、PostProgressBar と
    同じ技法に統一)。ナビの高さぶんの padding-bottom
    (generation-progress-nav-clearance)で白背景をナビの背面へ回り込ませる。
  */
  test("ナビより奥のレイヤーでタイトルと帯を描画する", () => {
    render(
      <GenerationProgressBar progress={40} progressTransitionDurationMs={25000} />
    );

    expect(screen.getByText("画像を生成中...")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveClass(
      "generation-progress-anchor",
      "generation-progress-bar-enter",
      "z-40"
    );
    expect(
      status.querySelector(".generation-progress-nav-clearance")
    ).not.toBeNull();
  });

  /*
    ⭐ 出現時は 0% から現在値へ伸ばす(シート内カードの animateFromZeroOnMount
    と同じ演出)。シートを閉じるのは多くの場合 generating(90%)の最中で、
    いきなり現在値で描くと transition が乗らず 90% のまま数十秒静止する
    = 「アニメーションが無い」に見える。
  */
  test("⭐0%から始まり、次のフレームで現在値へ伸びる", () => {
    render(
      <GenerationProgressBar progress={90} progressTransitionDurationMs={25000} />
    );

    // 初回レンダーは 0%(ここを描かないと transition が発火しない)
    expect(fill()).toHaveStyle({ width: "0%" });

    flushAnimationFrame();

    expect(fill()).toHaveStyle({ width: "90%" });
  });

  /*
    ⭐ 帯を伸ばしきる時間はステージごとに違う(generating は 25 秒)。
    シート内カードと同じ表(STAGE_PROGRESS_TRANSITION_MS)を Host が引いて渡す。
    一律の短い時間にすると 90% まで一瞬で駆け上がって静止する。
  */
  test("⭐渡された所要時間をtransitionに反映する", () => {
    const { rerender } = render(
      <GenerationProgressBar progress={90} progressTransitionDurationMs={25000} />
    );
    flushAnimationFrame();
    expect(fill()).toHaveStyle({ transitionDuration: "25000ms" });

    rerender(
      <GenerationProgressBar progress={95} progressTransitionDurationMs={1200} />
    );
    flushAnimationFrame();
    expect(fill()).toHaveStyle({ transitionDuration: "1200ms", width: "95%" });
  });

  test("progressが0や100でも帯の幅に反映される", () => {
    const { rerender } = render(
      <GenerationProgressBar progress={0} progressTransitionDurationMs={3000} />
    );
    flushAnimationFrame();
    expect(fill()).toHaveStyle({ width: "0%" });

    rerender(
      <GenerationProgressBar progress={100} progressTransitionDurationMs={1000} />
    );
    flushAnimationFrame();
    expect(fill()).toHaveStyle({ width: "100%" });
  });

  /*
    ⭐ 投稿の送信中バー(PostProgressBar)と同じく、ボトムナビは隠さない
    (ナビより奥のレイヤーに敷くだけ)。かつて document.body.classList を
    操作してナビを display: none にしていたが、「シートを閉じても他の
    画面へ移動できる」ことがこの機能の存在理由そのものなので、ナビを
    隠す実装を二度と持ち込まないための回帰ガード。
  */
  test("⭐bodyのクラスを一切操作しない(ナビを隠さない)", () => {
    const { unmount } = render(
      <GenerationProgressBar progress={10} progressTransitionDurationMs={3000} />
    );
    expect(document.body.className).toBe("");

    flushAnimationFrame();
    expect(document.body.className).toBe("");

    unmount();
    expect(document.body.className).toBe("");
  });
});

/** @jest-environment jsdom */

/**
 * 「このプロンプトで生成する」シートを閉じている間に画面下部へ出す、
 * 最小構成のバー(タイトル1行＋帯だけ)。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { GenerationProgressBar } from "@/features/generation/components/GenerationProgressBar";

const COPY: Record<string, string> = {
  generatingStatusTitle: "画像を生成中...",
};

// ⭐ 本物の next-intl の t は安定した参照を返す(generation-progress-host.test.tsx と同じ理由)。
const tStable = (key: string) => COPY[key] ?? key;
jest.mock("next-intl", () => ({
  useTranslations: () => tStable,
}));

describe("GenerationProgressBar", () => {
  test("visibleがfalseなら何も描画しない", () => {
    const { container } = render(
      <GenerationProgressBar visible={false} progress={40} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("visibleがtrueならタイトルと進捗率ぶんの帯を描画する", () => {
    render(<GenerationProgressBar visible progress={40} />);

    expect(screen.getByText("画像を生成中...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass(
      "generation-progress-anchor",
      "generation-progress-bar-enter"
    );

    const track = screen.getByRole("status").querySelector(".bg-slate-200");
    const fill = track?.firstElementChild as HTMLElement | null;
    expect(fill).toHaveStyle({ width: "40%" });
  });

  /*
    ⭐ 投稿の送信中バー(PostProgressBar)と違い、ボトムナビは隠さない
    (`.generation-progress-anchor` でナビの上に重ねるだけ)。かつて
    `document.body.classList` を操作してナビを `display: none` にしていたが、
    「シートを閉じても他の画面へ移動できる」ことがこの機能の存在理由その
    ものなので、ナビを隠す実装を二度と持ち込まないための回帰ガード。
  */
  test("⭐ボトムナビ用にbodyのクラスを一切操作しない(隠さない)", () => {
    const { rerender, unmount } = render(
      <GenerationProgressBar visible={false} progress={0} />
    );
    expect(document.body.className).toBe("");

    rerender(<GenerationProgressBar visible progress={10} />);
    expect(document.body.className).toBe("");

    unmount();
    expect(document.body.className).toBe("");
  });

  test("progressが0や100でも帯の幅に反映される", () => {
    const { rerender } = render(
      <GenerationProgressBar visible progress={0} />
    );
    let track = screen.getByRole("status").querySelector(".bg-slate-200");
    let fill = track?.firstElementChild as HTMLElement | null;
    expect(fill).toHaveStyle({ width: "0%" });

    rerender(<GenerationProgressBar visible progress={100} />);
    track = screen.getByRole("status").querySelector(".bg-slate-200");
    fill = track?.firstElementChild as HTMLElement | null;
    expect(fill).toHaveStyle({ width: "100%" });
  });
});

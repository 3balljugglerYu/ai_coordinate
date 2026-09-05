/** @jest-environment jsdom */

/**
 * 投稿の送信中に画面下部へ出すバー。ボトムナビ(z-50)より奥のレイヤー
 * (z-40)に敷き、ナビは隠さない。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { PostProgressBar } from "@/features/posts/components/PostProgressBar";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      postSubmitting: "投稿中...",
    })[key] ?? key,
}));

describe("PostProgressBar", () => {
  test("visibleがfalseなら何も描画しない", () => {
    const { container } = render(<PostProgressBar visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  /*
    ⭐ ボトムナビ(z-50)より奥のレイヤーに敷く(z-40)。ナビの高さぶんの
    padding-bottom(post-progress-nav-clearance)で白背景をナビの背面へ
    回り込ませ、タイトル行はナビの上端に接する位置に来る。
  */
  test("visibleがtrueならナビより奥のレイヤーでタイトルと帯を描画する", () => {
    render(<PostProgressBar visible />);

    expect(screen.getByText("投稿中...")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveClass("post-progress-anchor", "z-40");
    expect(status.querySelector(".post-progress-nav-clearance")).not.toBeNull();
  });

  /*
    ⭐ 投稿は生成と違い数秒で終わる一時的な状態だが、「送信中はどこにも
    行けない」という指摘を生成中バー修正時に受け、ナビを隠す実装は
    廃止して揃えた。body のクラスを一切操作しないことを保証する
    (ナビを隠す実装を二度と持ち込まないための回帰ガード)。
  */
  test("⭐bodyのクラスを一切操作しない(ナビを隠さない)", () => {
    const { rerender, unmount } = render(<PostProgressBar visible={false} />);
    expect(document.body.className).toBe("");

    rerender(<PostProgressBar visible />);
    expect(document.body.className).toBe("");

    unmount();
    expect(document.body.className).toBe("");
  });
});

/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { GenerationTipCard } from "@/features/style/components/GenerationTipCard";

describe("GenerationTipCard", () => {
  test("見出しと本文を出す", () => {
    render(
      <GenerationTipCard
        tip="レンダリング品質を「バランス良く生成」にすると崩れにくいです！"
        label="ワンポイントアドバイス"
      />
    );

    expect(screen.getByText("ワンポイントアドバイス")).toBeInTheDocument();
    expect(
      screen.getByText(/バランス良く生成/)
    ).toBeInTheDocument();
  });

  test("改行を書いたまま出す（運営が書き分けられるように）", () => {
    render(<GenerationTipCard tip={"1行目\n2行目"} label="ヒント" />);

    const body = screen.getByText(/1行目/);
    expect(body).toHaveClass("whitespace-pre-line");
  });
});

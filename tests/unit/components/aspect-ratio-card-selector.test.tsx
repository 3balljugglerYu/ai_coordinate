/** @jest-environment jsdom */

import { render, screen, fireEvent } from "@testing-library/react";
import { AspectRatioCardSelector } from "@/components/AspectRatioCardSelector";
import {
  STYLE_OUTPUT_ASPECT_RATIO_MODES,
  FREE_OUTPUT_ASPECT_RATIO_MODES,
} from "@/shared/generation/style-output-aspect-ratio";

const ADMIN_LABELS = {
  sectionTitle: "出力比率",
  auto: "自動",
  autoDescription: "アップロード画像に合わせる",
  presetImage: "登録画像",
  presetImageDescription: "登録画像(サムネ)の比率に合わせる",
  square: "正方形",
  portrait: "縦長",
  landscape: "横長",
};

describe("AspectRatioCardSelector", () => {
  test("admin 用(11種: 自動 + 登録画像 + 明示9比率)を描画する", () => {
    render(
      <AspectRatioCardSelector
        modes={STYLE_OUTPUT_ASPECT_RATIO_MODES}
        value="source"
        onChange={() => {}}
        labels={ADMIN_LABELS}
      />,
    );
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(11);
  });

  test("preset_image カードは専用ラベルと説明を持つ", () => {
    render(
      <AspectRatioCardSelector
        modes={STYLE_OUTPUT_ASPECT_RATIO_MODES}
        value="source"
        onChange={() => {}}
        labels={ADMIN_LABELS}
      />,
    );
    expect(
      screen.getByRole("radio", {
        name: "登録画像（登録画像(サムネ)の比率に合わせる）",
      }),
    ).toBeTruthy();
  });

  test("preset_image を選ぶと onChange に値が渡る", () => {
    const onChange = jest.fn();
    render(
      <AspectRatioCardSelector
        modes={STYLE_OUTPUT_ASPECT_RATIO_MODES}
        value="source"
        onChange={onChange}
        labels={ADMIN_LABELS}
      />,
    );
    fireEvent.click(
      screen.getByRole("radio", {
        name: "登録画像（登録画像(サムネ)の比率に合わせる）",
      }),
    );
    expect(onChange).toHaveBeenCalledWith("preset_image");
  });

  test("Free 用(10種)では preset_image を描画しない", () => {
    render(
      <AspectRatioCardSelector
        modes={FREE_OUTPUT_ASPECT_RATIO_MODES}
        value="source"
        onChange={() => {}}
        labels={ADMIN_LABELS}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(
      screen.queryByRole("radio", { name: /登録画像/ }),
    ).toBeNull();
  });

  test("選択中の値が aria-checked=true になる(色以外の選択表現)", () => {
    render(
      <AspectRatioCardSelector
        modes={STYLE_OUTPUT_ASPECT_RATIO_MODES}
        value="4:5"
        onChange={() => {}}
        labels={ADMIN_LABELS}
      />,
    );
    expect(
      screen.getByRole("radio", { checked: true }).getAttribute("aria-label"),
    ).toBe("4:5 縦長");
  });

  test("同一ページに複数置いても見出しの id が衝突しない", () => {
    render(
      <>
        <AspectRatioCardSelector
          modes={FREE_OUTPUT_ASPECT_RATIO_MODES}
          value="source"
          onChange={() => {}}
          labels={ADMIN_LABELS}
        />
        <AspectRatioCardSelector
          modes={FREE_OUTPUT_ASPECT_RATIO_MODES}
          value="1:1"
          onChange={() => {}}
          labels={ADMIN_LABELS}
        />
      </>,
    );
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.getAttribute("aria-labelledby"));
    expect(ids[0]).not.toBe(ids[1]);
  });
});

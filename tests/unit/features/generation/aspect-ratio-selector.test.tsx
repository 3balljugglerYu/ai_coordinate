/** @jest-environment jsdom */

import { render, screen, fireEvent } from "@testing-library/react";
import { AspectRatioSelector } from "@/features/generation/components/AspectRatioSelector";

// free namespace の i18n をモック(実文言に依存しないよう key ベースで返す)。
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      aspectSectionTitle: "画像の比率",
      aspectAuto: "自動",
      aspectAutoDescription: "アップロード画像に合わせる",
      aspectSquare: "正方形",
      aspectPortrait: "縦長",
      aspectLandscape: "横長",
    };
    return map[key] ?? key;
  },
}));

describe("AspectRatioSelector", () => {
  test("radiogroup と 10 個の radio(自動 + 明示9比率)を描画する", () => {
    render(<AspectRatioSelector value="source" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
  });

  test("value に対応する radio が aria-checked=true(色以外で選択が分かる)", () => {
    render(<AspectRatioSelector value="2:3" onChange={() => {}} />);
    const checked = screen.getByRole("radio", { checked: true });
    expect(checked.getAttribute("aria-label")).toBe("2:3 縦長");
  });

  test("自動カードは説明付きの aria-label を持つ", () => {
    render(<AspectRatioSelector value="source" onChange={() => {}} />);
    expect(
      screen.getByRole("radio", { name: "自動（アップロード画像に合わせる）" }),
    ).toBeTruthy();
  });

  test("1:1 は正方形として aria-label に向きを示す", () => {
    render(<AspectRatioSelector value="source" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "1:1 正方形" })).toBeTruthy();
  });

  test("radio をクリックすると onChange にその比率が渡る", () => {
    const onChange = jest.fn();
    render(<AspectRatioSelector value="source" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "16:9 横長" }));
    expect(onChange).toHaveBeenCalledWith("16:9");
  });
});

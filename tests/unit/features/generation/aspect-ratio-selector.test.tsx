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

  describe("選択中カードの横スクロール復元", () => {
    // jsdom はレイアウトを持たないため getBoundingClientRect をモックして
    // 「コンテナの可視範囲」と「選択カードの位置」を擬似的に与える。
    const CONTAINER_RECT = { left: 0, right: 300 } as DOMRect;

    function setupRects(selectedRect: { left: number; right: number }) {
      const spy = jest
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this.getAttribute("role") === "radiogroup") return CONTAINER_RECT;
          if (this.getAttribute("aria-checked") === "true") {
            return selectedRect as DOMRect;
          }
          return { left: 0, right: 0 } as DOMRect;
        });
      return spy;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("選択カードが右にはみ出していれば scrollLeft を増やして見える位置へ寄せる", () => {
      setupRects({ left: 420, right: 500 });
      render(<AspectRatioSelector value="16:9" onChange={() => {}} />);
      const container = screen.getByRole("radiogroup");
      // 0 から increase される(はみ出し量 200 + 余白 12)
      expect(container.scrollLeft).toBeGreaterThan(0);
    });

    test("選択カードが左にはみ出していれば scrollLeft を減らす(RTL/巻き戻し方向)", () => {
      setupRects({ left: -80, right: 10 });
      render(<AspectRatioSelector value="16:9" onChange={() => {}} />);
      const container = screen.getByRole("radiogroup");
      expect(container.scrollLeft).toBeLessThan(0);
    });

    test("既に表示範囲内のカードは動かさない", () => {
      setupRects({ left: 40, right: 120 });
      render(<AspectRatioSelector value="4:5" onChange={() => {}} />);
      const container = screen.getByRole("radiogroup");
      expect(container.scrollLeft).toBe(0);
    });

    test("ページスクロールAPI(scrollIntoView)は使わない", () => {
      const scrollIntoView = jest.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      setupRects({ left: 420, right: 500 });
      render(<AspectRatioSelector value="16:9" onChange={() => {}} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});

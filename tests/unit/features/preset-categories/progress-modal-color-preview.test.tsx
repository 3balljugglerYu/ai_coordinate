/**
 * ProgressModalColorPreview のレンダーテスト。
 * リング/バッジに加え、CTAボタンのプレビューが admin 設定色で描画され、
 * 未設定時は従来のオレンジ/白にフォールバックすることを検証する。
 */

import { render, screen } from "@testing-library/react";
import { ProgressModalColorPreview } from "@/features/preset-categories/components/ProgressModalColorPreview";

describe("ProgressModalColorPreview", () => {
  test("色未設定: CTAプレビューは標準文言で表示され、背景色の inline 指定はない", () => {
    render(
      <ProgressModalColorPreview
        ringColor={null}
        badgeColor={null}
        badgeTextColor={null}
        badgeBgColor={null}
        buttonColor={null}
        buttonTextColor={null}
      />,
    );
    const cta = screen.getByText("カードを作成する →");
    expect(cta).toBeInTheDocument();
    // 塗り色未設定 → backgroundColor の inline 指定なし(オレンジは class 側)
    expect(cta.getAttribute("style") ?? "").not.toContain("background-color");
  });

  test("ボタン色設定: CTAプレビューに admin の塗り色/文字色が反映される", () => {
    render(
      <ProgressModalColorPreview
        ringColor={null}
        badgeColor={null}
        badgeTextColor={null}
        badgeBgColor={null}
        buttonColor="#C670FF"
        buttonTextColor="#FFFFFF"
      />,
    );
    const cta = screen.getByText("カードを作成する →");
    const style = cta.getAttribute("style") ?? "";
    // jsdom は rgb 形式で直列化する
    expect(style).toContain("background-color: rgb(198, 112, 255)");
    expect(style).toContain("color: rgb(255, 255, 255)");
  });
});

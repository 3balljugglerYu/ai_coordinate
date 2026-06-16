/**
 * `AchievementBadge` の色プロップ分岐テスト。
 *
 * SVG をインラインで描く純コンポーネント(next/image 不要)。
 * - color/textColor/bgColor が null(未指定)のときは従来のゴールド配色
 *   (外側 url(#badgeStroke) / 内側 url(#badgeFill) / % 文字 #F97316)。
 * - 指定があるときはその単色で外側スカロップ・内側背景・文字色を塗る。
 * alt="" の SVG は role を持たないため、container.querySelectorAll で要素を引く。
 */

import { render } from "@testing-library/react";

import { AchievementBadge } from "@/features/collections/components/AchievementBadge";

describe("AchievementBadge: 色プロップ分岐", () => {
  test("色プロップ未指定なら従来のゴールド配色(グラデーション参照)になる", () => {
    const { container } = render(<AchievementBadge percent={66} />);

    const polygons = container.querySelectorAll("polygon");
    // 外側スカロップ(縁取り)= url(#badgeStroke)、内側(中身)= url(#badgeFill)
    expect(polygons[0]).toHaveAttribute("fill", "url(#badgeStroke)");
    expect(polygons[1]).toHaveAttribute("fill", "url(#badgeFill)");

    // % 文字はオレンジ #F97316
    const texts = container.querySelectorAll("text");
    expect(texts[0]).toHaveAttribute("fill", "#F97316");
    expect(texts[0]?.textContent).toBe("66%");
    // 「達成！」ラベルは茶 #B45309
    expect(texts[1]).toHaveAttribute("fill", "#B45309");
  });

  test("色プロップ指定時はその単色で外側/内側/文字を塗る", () => {
    const { container } = render(
      <AchievementBadge
        percent={66}
        color="#16A34A"
        textColor="#FFFFFF"
        bgColor="#166534"
      />,
    );

    const polygons = container.querySelectorAll("polygon");
    expect(polygons[0]).toHaveAttribute("fill", "#16A34A");
    expect(polygons[1]).toHaveAttribute("fill", "#166534");

    const texts = container.querySelectorAll("text");
    // % 文字・「達成！」ともに textColor で塗る
    expect(texts[0]).toHaveAttribute("fill", "#FFFFFF");
    expect(texts[1]).toHaveAttribute("fill", "#FFFFFF");
  });
});

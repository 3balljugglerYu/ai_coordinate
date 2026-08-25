/** @jest-environment jsdom */

/**
 * スクショの最大幅。
 *
 * ⭐ 以前は「横長か縦長か」の二択だった。しかし縦長には二種類ある。
 *
 * - 端末まるごと(縦横比 2.2〜2.6)。広げると画面からはみ出すほど高くなる
 * - 画面の一部を切り出したもの(1.6 程度)。190px では文字が読めない
 *
 * 同じ「縦長」で扱うと後者が読めないまま据え置かれるので、**高さがどこまで
 * 伸びるか**で分ける。この部品は `/creator-rewards` と共用なので、
 * あちらの端末まるごとのスクショが巻き添えで伸びないことも併せて固定する。
 */

import React from "react";
import { render } from "@testing-library/react";
import { ScreenshotSlot } from "@/features/credits/components/reward-guide";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    sizes,
  }: {
    src: string;
    alt: string;
    sizes?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-sizes={sizes} />
  ),
}));

function slotClass(width: number, height: number): string {
  const { container } = render(
    <ScreenshotSlot
      src="/x.webp"
      alt="a"
      caption="c"
      width={width}
      height={height}
    />
  );
  return container.querySelector("figure")?.className ?? "";
}

describe("ScreenshotSlot の最大幅", () => {
  test("横長は 300px（通知など、切り出した一部）", () => {
    expect(slotClass(347, 205)).toContain("max-w-[300px]");
  });

  test("⭐縦長でも端末まるごとでなければ 260px（190px だと文字が読めない）", () => {
    // /use-prompts のステップ3。比率 1.64
    expect(slotClass(560, 921)).toContain("max-w-[260px]");
  });

  test("⭐端末まるごとの縦長は 190px のまま（広げると高くなりすぎる）", () => {
    // /creator-rewards の3枚。比率 2.27 / 2.47 / 2.56
    expect(slotClass(382, 869)).toContain("max-w-[190px]");
    expect(slotClass(382, 945)).toContain("max-w-[190px]");
    expect(slotClass(382, 979)).toContain("max-w-[190px]");
  });

  test("境目(1.8)のすぐ内と外で切り替わる", () => {
    expect(slotClass(100, 180)).toContain("max-w-[260px]");
    expect(slotClass(100, 181)).toContain("max-w-[190px]");
  });

  /**
   * `sizes` が実際の表示幅とずれていると、Next は小さすぎる画像を選ぶ。
   * 以前は全スロットが "190px" 固定で、300px 幅のスクショがぼやけていた。
   */
  test("⭐sizes は実際の最大幅に合わせる（小さすぎる画像を選ばせない）", () => {
    const { container } = render(
      <ScreenshotSlot src="/x.webp" alt="a" caption="c" width={347} height={205} />
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "data-sizes",
      "300px"
    );
  });
});

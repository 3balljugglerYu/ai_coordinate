/**
 * Before / After の枠の、After 左下のラベル(生成方法)。
 *
 * カタログ刷新後(公開前は運営だけ)はラベルの名前が長い(with Persta ORIGINAL)。
 * 枠の外から重ねる従来の形では、幅 320px で AFTER と重なった。
 * ラベルを渡したときは After の中で AFTER と同じ行に並べ、入りきらないときは
 * ラベルを折り返す(重なりは行の並びで防ぐので、ここでは並び方を確かめる)。
 * 渡さないときの描画(一般の利用者・元のプロンプトのカード)は変えない。
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { BeforeAfterFrame } from "@/features/posts/components/BeforeAfterFrame";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

function renderFrame(overrides: Partial<React.ComponentProps<typeof BeforeAfterFrame>> = {}) {
  return render(
    <BeforeAfterFrame
      afterUrl="https://example.test/after.png"
      beforeUrl="https://example.test/before.png"
      aspectRatio={896 / 1152}
      afterAlt="after"
      beforeAlt="before"
      afterLabel="After"
      beforeLabel="Before"
      sizes="100vw"
      testIdPrefix="frame"
      {...overrides}
    />
  );
}

describe("BeforeAfterFrame の After 左下のラベル", () => {
  test("渡すと、After の中で AFTER と同じ行に並べる", () => {
    renderFrame({ afterCornerLabel: <span>with Persta ORIGINAL</span> });

    const row = within(screen.getByTestId("frame-after-frame")).getByTestId(
      "frame-after-corner-row"
    );
    expect(within(row).getByText("with Persta ORIGINAL")).toBeTruthy();
    expect(within(row).getByText("After")).toBeTruthy();
    // AFTER は縮めず右端へ寄せる(ラベルの方が折り返す)
    expect(within(row).getByText("After").className).toContain("shrink-0");
    expect(within(row).getByText("After").className).toContain("ml-auto");
    // AFTER は1つだけ(行の外に従来の AFTER を重ねない)
    expect(screen.getAllByText("After")).toHaveLength(1);
  });

  test("Before が無い1枚表示では、ラベルだけを出す(AFTER は出さない)", () => {
    renderFrame({ beforeUrl: null, afterCornerLabel: <span>User ORIGINAL</span> });

    const row = screen.getByTestId("frame-after-corner-row");
    expect(within(row).getByText("User ORIGINAL")).toBeTruthy();
    expect(screen.queryByText("After")).toBeNull();
  });

  test("渡さないときは従来どおり(行を作らず、AFTER を右下に重ねる)", () => {
    renderFrame();

    expect(screen.queryByTestId("frame-after-corner-row")).toBeNull();
    const after = within(screen.getByTestId("frame-after-frame")).getByText("After");
    expect(after.className).toContain("absolute bottom-1 right-1");
  });
});

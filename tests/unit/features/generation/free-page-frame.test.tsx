/** @jest-environment jsdom */

/**
 * Free Style（/free）の背景と余白の入れ物。
 *
 * ⭐ 一般の利用者には今と同じ HTML（背景 bg-gray-50・上余白 pt-6 / md:pt-8）。
 * カタログ刷新（公開前は運営だけ）では、/styles・/user-styles（StylesCatalogMain）と同じく
 * 背景を白にし、上の余白をなくす。タブの白い帯とページの間に境目を出さない
 * （2026-09-29 ユーザー指示「他と合わせたい」）。
 */

import React from "react";
import { render } from "@testing-library/react";

const mockRevamp = jest.fn<boolean, []>();
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

import { FreePageFrame } from "@/features/generation/components/FreePageFrame";

describe("FreePageFrame", () => {
  test("一般の利用者には今と同じ HTML を出す", () => {
    mockRevamp.mockReturnValue(false);
    const { container } = render(
      <FreePageFrame>
        <p>body</p>
      </FreePageFrame>
    );

    expect(container.innerHTML).toBe(
      '<div class="min-h-screen bg-gray-50"><div class="pt-6 md:pt-8 pb-8 px-4"><p>body</p></div></div>'
    );
  });

  test("刷新後は背景を白にし、上の余白をなくす（カタログのほかの画面と同じ）", () => {
    mockRevamp.mockReturnValue(true);
    const { container } = render(
      <FreePageFrame>
        <p>body</p>
      </FreePageFrame>
    );

    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("min-h-screen");
    expect(outer.className).toContain("bg-white");
    expect(outer.className).not.toContain("bg-gray-50");
    const inner = outer.firstElementChild as HTMLElement;
    expect(inner.className).toContain("pt-0");
    expect(inner.className).not.toMatch(/(^|\s)(md:)?pt-(6|8)(\s|$)/);
    expect(inner.textContent).toBe("body");
  });
});

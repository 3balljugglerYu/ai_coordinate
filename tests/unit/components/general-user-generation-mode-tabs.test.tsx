/** @jest-environment jsdom */

/**
 * 一般の利用者用の生成モードのタブ（(app)/layout.tsx に置く）。
 *
 * ⭐ 一般の利用者には、今までどおりここから生成モードのタブを出す。
 * カタログ刷新（公開前は運営だけ）の人には、TopTabsSlot がタブを出すので、
 * ここは何も出さない（二重にしない）。
 */

import React from "react";
import { render, screen } from "@testing-library/react";

const mockRevamp = jest.fn<boolean, []>();
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

jest.mock("@/components/GenerationModeTabs", () => ({
  GenerationModeTabs: () => <div data-testid="generation-mode-tabs" />,
}));

import { GeneralUserGenerationModeTabs } from "@/components/GeneralUserGenerationModeTabs";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GeneralUserGenerationModeTabs", () => {
  test("一般の利用者には、今までどおり生成モードのタブを出す", () => {
    mockRevamp.mockReturnValue(false);
    render(<GeneralUserGenerationModeTabs />);

    expect(screen.getByTestId("generation-mode-tabs")).toBeTruthy();
  });

  test("刷新後の人には出さない(TopTabsSlot と二重にしない)", () => {
    mockRevamp.mockReturnValue(true);
    const { container } = render(<GeneralUserGenerationModeTabs />);

    expect(container.innerHTML).toBe("");
  });
});

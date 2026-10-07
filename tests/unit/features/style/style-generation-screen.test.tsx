/** @jest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const formProps = jest.fn();
jest.mock("@/features/style/components/OneTapStyleGenerationForm", () => ({
  OneTapStyleGenerationForm: (props: Record<string, unknown>) => {
    formProps(props);
    return <div data-testid="form" />;
  },
}));
jest.mock("@/features/generation/components/GenerationScreenFrame", () => ({
  GenerationScreenFrame: (props: { title: string; fallbackHref: string; handOffProgress: boolean; children: React.ReactNode }) => (
    <div data-testid="frame" data-title={props.title} data-fallback={props.fallbackHref} data-handoff={String(props.handOffProgress)}>
      {props.children}
    </div>
  ),
}));
jest.mock("@/features/generation/components/PromptLockedGenerationHeader", () => ({
  PromptLockedGenerationHeader: (props: { mode?: string; showBalancePlaceholder?: boolean }) => (
    <div data-testid="header" data-mode={props.mode} data-placeholder={String(props.showBalancePlaceholder)} />
  ),
}));
jest.mock("@/features/generation/components/PromptLockedGenerationResults", () => ({
  PromptLockedGenerationResults: (props: { generationType?: string }) => (
    <div data-testid="results" data-type={props.generationType} />
  ),
}));
jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  GenerationStateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { StyleGenerationScreen } from "@/features/style/components/StyleGenerationScreen";

const preset = { id: "preset-1", slug: "paris code" } as unknown as StylePresetPublicSummary;

beforeEach(() => jest.clearAllMocks());

test("ログイン中: シートと同じ One-Tap Style のフォーム・見出し・結果一覧", () => {
  render(<StyleGenerationScreen preset={preset} subscriptionPlan="free" canUseFreePose isGuest={false} />);
  const frame = screen.getByTestId("frame");
  expect(frame.getAttribute("data-title")).toBe("generationSheetTitle");
  expect(frame.getAttribute("data-fallback")).toBe("/styles/paris%20code");
  expect(frame.getAttribute("data-handoff")).toBe("true");
  expect(formProps).toHaveBeenCalledWith(
    expect.objectContaining({
      variant: "sheet",
      preset,
      initialAuthState: "authenticated",
      showResultPanel: false,
      canUseFreePose: true,
    }),
  );
  expect(screen.getByTestId("header").getAttribute("data-mode")).toBe("style");
  expect(screen.getByTestId("results").getAttribute("data-type")).toBe("one_tap_style");
});

test("未ログイン: 結果はフォームで見せ、一覧・残高の枠・バーの引き継ぎは無し", () => {
  render(<StyleGenerationScreen preset={preset} subscriptionPlan="free" canUseFreePose={false} isGuest />);
  expect(screen.getByTestId("frame").getAttribute("data-handoff")).toBe("false");
  expect(formProps).toHaveBeenCalledWith(expect.objectContaining({ initialAuthState: "guest", showResultPanel: true }));
  expect(screen.queryByTestId("results")).toBeNull();
  expect(screen.getByTestId("header").getAttribute("data-placeholder")).toBe("false");
});

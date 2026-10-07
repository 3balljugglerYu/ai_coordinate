/** @jest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";

const formProps = jest.fn();
jest.mock("@/features/generation/components/GenerationFormContainer", () => ({
  GenerationFormContainer: (props: Record<string, unknown>) => {
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
  PromptLockedGenerationHeader: () => <div data-testid="header" />,
}));
jest.mock("@/features/generation/components/PromptLockedGenerationResults", () => ({
  PromptLockedGenerationResults: () => <div data-testid="results" />,
}));
jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  GenerationStateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const inputsMock = jest.fn<
  { lockedPromptText: string; lockedNameInput: { label: string; required: boolean }; lockedNameInputLoading: boolean },
  [unknown]
>(() => ({
  lockedPromptText: "公開の本文",
  lockedNameInput: { label: "名前", required: true },
  lockedNameInputLoading: false,
}));

jest.mock("@/features/generation/hooks/usePromptLockedGenerationInputs", () => ({
  usePromptLockedGenerationInputs: (args: unknown) => inputsMock(args),
}));
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => true,
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { PromptLockedGenerationScreen } from "@/features/generation/components/PromptLockedGenerationScreen";

test("シートと同じフォーム・見出し・結果を、全画面の外枠に入れる", () => {
  render(<PromptLockedGenerationScreen sourcePostId="p 1" subscriptionPlan="light" promptVisibility="public" />);
  expect(inputsMock).toHaveBeenCalledWith({ active: true, sourcePostId: "p 1", promptVisibility: "public" });
  const frame = screen.getByTestId("frame");
  expect(frame.getAttribute("data-title")).toBe("feedUseCatalog");
  expect(frame.getAttribute("data-fallback")).toBe("/posts/p%201");
  expect(frame.getAttribute("data-handoff")).toBe("true");
  expect(formProps).toHaveBeenCalledWith(
    expect.objectContaining({
      subscriptionPlan: "light",
      authState: "authenticated",
      mode: "free",
      promptLocked: true,
      lockedPromptText: "公開の本文",
      sourcePostId: "p 1",
      lockedNameInput: { label: "名前", required: true },
      lockedNameInputLoading: false,
    }),
  );
  expect(screen.getByTestId("results")).toBeTruthy();
});

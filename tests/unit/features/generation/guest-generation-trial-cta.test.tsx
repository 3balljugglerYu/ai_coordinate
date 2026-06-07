/** @jest-environment jsdom */

/**
 * `GuestGenerationTrialCta`（ログイン前のお試しバナー）。
 *
 * - 生成前（共有ストア空）: 現状どおり /login へのリンク。
 * - 生成後（ストアに画像）: 「保存する」ボタンに切替、押下で stash + 計測 + モーダル。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";

jest.mock("next-intl", () => ({ useTranslations: jest.fn() }));

const mockStash = jest.fn();
jest.mock("@/features/wardrobe/lib/pending-wardrobe-save", () => ({
  stashPendingWardrobeSave: (...args: unknown[]) => mockStash(...args),
  claimPendingWardrobeSave: jest.fn(),
}));

const mockRecord = jest.fn();
jest.mock("@/features/style/lib/style-usage-client", () => ({
  recordStyleUsageClientEvent: (...args: unknown[]) => mockRecord(...args),
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ open, title }: { open: boolean; title?: string }) =>
    open ? <div data-testid="auth-modal">{title}</div> : null,
}));

import { GuestGenerationTrialCta } from "@/features/generation/components/GuestGenerationTrialCta";
import {
  clearGuestGeneration,
  setGuestGeneration,
} from "@/features/wardrobe/lib/guest-generation-store";

const labels: Record<string, string> = {
  wardrobeSaveButton: "保存する",
  wardrobeSaveModalTitle: "保存タイトル",
  wardrobeSaveModalDescription: "保存説明",
};
const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

beforeEach(() => {
  useTranslationsMock.mockImplementation(
    () =>
      ((key: string) => labels[key] ?? key) as ReturnType<typeof useTranslations>,
  );
  mockStash.mockReset();
  mockRecord.mockReset().mockResolvedValue(undefined);
  clearGuestGeneration();
});

afterEach(() => {
  clearGuestGeneration();
  jest.clearAllMocks();
});

function renderCta() {
  return render(
    <GuestGenerationTrialCta
      title="お試しタイトル"
      description="お試し説明"
      actionLabel="ログイン / 新規登録"
      testId="guest-generation-trial-cta"
    />,
  );
}

describe("GuestGenerationTrialCta", () => {
  test("生成前(ストア空): /login へのリンクを表示し、保存ボタンは出さない", () => {
    renderCta();

    expect(
      screen.getByTestId("guest-generation-trial-cta"),
    ).toBeInTheDocument();
    expect(screen.getByText("お試しタイトル")).toBeInTheDocument();
    expect(screen.getByText("お試し説明")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ログイン / 新規登録" }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.queryByRole("button", { name: "保存する" }),
    ).not.toBeInTheDocument();
  });

  test("生成後(ストアに画像): 保存ボタンに切替、押下で stash + 計測 + モーダル", () => {
    setGuestGeneration({
      imageBase64: "data:image/png;base64,abc",
      styleId: "s1",
    });
    renderCta();

    expect(
      screen.queryByRole("link", { name: "ログイン / 新規登録" }),
    ).not.toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "保存する" });

    fireEvent.click(saveButton);

    expect(mockStash).toHaveBeenCalledWith({
      imageBase64: "data:image/png;base64,abc",
      styleId: "s1",
    });
    expect(mockRecord).toHaveBeenCalledWith({
      eventType: "wardrobe_save_click",
      styleId: "s1",
    });
    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
  });
});

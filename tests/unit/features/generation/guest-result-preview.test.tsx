/** @jest-environment jsdom */

/**
 * `GuestResultPreview` の挙動テスト。
 *
 * Step 3 で追加したダウンロードボタンが、結果表示中だけ render され、
 * クリック時に共通ヘルパへ data URL と coordinate-guest-* の id が渡る
 * ことを検証する。あわせて既存のログイン CTA も併存していることを確認する。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockShareOrDownload = jest.fn();
jest.mock("@/features/generation/lib/download-image", () => ({
  shareOrDownloadGeneratedImage: (...args: unknown[]) =>
    mockShareOrDownload(...args),
}));

import { GuestResultPreview } from "@/features/generation/components/GuestResultPreview";

const labels: Record<string, string> = {
  guestResultTitle: "Result",
  guestResultPlaceholder: "placeholder",
  guestResultAlt: "alt",
  guestResultSaveHint: "leave-page-warning",
  guestResultLoginCta: "Sign in",
  guestResultDownloadAction: "Download",
  guestResultDownloadAriaLabel: "Download generated result",
  guestResultDownloadSuccessTitle: "downloaded",
  guestResultDownloadSuccessDescription: "saved",
  guestResultDownloadFailed: "download-failed",
};

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

beforeEach(() => {
  useTranslationsMock.mockImplementation(
    () =>
      ((key: string) => labels[key] ?? key) as ReturnType<typeof useTranslations>,
  );
  mockToast.mockReset();
  mockShareOrDownload.mockReset();
  mockShareOrDownload.mockImplementation(async (_image, _msgs, callbacks) => {
    callbacks?.onDownloadSuccess?.();
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("GuestResultPreview", () => {
  test("result が null のときは DL ボタンも CTA も描画しない", () => {
    render(<GuestResultPreview result={null} onLoginCtaClick={jest.fn()} />);

    expect(
      screen.queryByRole("button", { name: "Download generated result" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });

  test("result があるとき DL ボタンとログイン CTA が併存する", () => {
    render(
      <GuestResultPreview
        result={{ url: "data:image/png;base64,abc", mimeType: "image/png" }}
        onLoginCtaClick={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Download generated result" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
    // ヒント文も維持されている
    expect(screen.getByText("leave-page-warning")).toBeInTheDocument();
  });

  test("DL ボタンクリックで共通ヘルパに data URL と coordinate-guest の id を渡す", () => {
    render(
      <GuestResultPreview
        result={{ url: "data:image/png;base64,abc", mimeType: "image/png" }}
        onLoginCtaClick={jest.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download generated result" }),
    );

    expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
    const [target] = mockShareOrDownload.mock.calls[0];
    expect(target).toEqual({
      url: "data:image/png;base64,abc",
      id: "coordinate-guest",
    });
  });

  test("CTA クリックで onLoginCtaClick が呼ばれる", () => {
    const onLogin = jest.fn();
    render(
      <GuestResultPreview
        result={{ url: "data:image/png;base64,abc", mimeType: "image/png" }}
        onLoginCtaClick={onLogin}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});

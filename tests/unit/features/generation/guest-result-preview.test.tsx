/** @jest-environment jsdom */

/**
 * `GuestResultPreview` の挙動テスト。
 *
 * ゲスト結果プレビューは /style と挙動を揃え、
 * - ダウンロードボタン（ゲストは透かし付き = transformBlob を渡す）
 * - 「保存する」= アカウント保存（ログイン転換）ボタン
 * を結果表示中だけ render する。あわせて「離脱で消える」ヒントを維持する。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  guestResultDownloadAction: "Download",
  guestResultDownloadAriaLabel: "Download generated result",
  guestResultDownloadSuccessTitle: "downloaded",
  guestResultDownloadSuccessDescription: "saved",
  guestResultDownloadFailed: "download-failed",
  // WardrobeSaveButton は "style" 名前空間の wardrobeSaveButton を使う
  wardrobeSaveButton: "Save to account",
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
  test("result が null のときは DL ボタンも保存ボタンも描画しない", () => {
    render(
      <GuestResultPreview result={null} onSaveToAccountClick={jest.fn()} />,
    );

    expect(
      screen.queryByRole("button", { name: "Download generated result" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save to account" }),
    ).not.toBeInTheDocument();
  });

  test("result があるとき DL ボタンと保存ボタンが併存し、ヒントも残る", () => {
    render(
      <GuestResultPreview
        result={{ url: "data:image/png;base64,abc", mimeType: "image/png" }}
        onSaveToAccountClick={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Download generated result" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save to account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("leave-page-warning")).toBeInTheDocument();
  });

  test("DL クリックで共通ヘルパに data URL / id / 透かし関数を渡す", async () => {
    render(
      <GuestResultPreview
        result={{ url: "data:image/png;base64,abc", mimeType: "image/png" }}
        onSaveToAccountClick={jest.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download generated result" }),
    );

    await waitFor(() => expect(mockShareOrDownload).toHaveBeenCalledTimes(1));
    const call = mockShareOrDownload.mock.calls[0];
    expect(call[0]).toEqual({
      url: "data:image/png;base64,abc",
      id: "coordinate-guest",
    });
    // ゲスト DL は透かし（transformBlob）が 4 番目の引数として渡る
    expect(typeof call[3]).toBe("function");
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
  });

  test("保存ボタンクリックで onSaveToAccountClick が呼ばれる", () => {
    const onSave = jest.fn();
    render(
      <GuestResultPreview
        result={{ url: "data:image/png;base64,abc", mimeType: "image/png" }}
        onSaveToAccountClick={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save to account" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

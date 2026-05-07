/** @jest-environment jsdom */

/**
 * `features/posts/components/DownloadButton.tsx` の挙動テスト。
 *
 * このボタンは表示用 WebP と DL 用 PNG/JPEG を分離する責務を持つ。
 * `originalImageUrl` が渡されていればそちらを優先し、未指定なら
 * `imageUrl` に fallback することを検証する。
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

import { DownloadButton } from "@/features/posts/components/DownloadButton";

const labels: Record<string, string> = {
  downloadAriaLabel: "Download",
  downloadUnauthorized: "denied",
  downloadFetchFailed: "fetch-failed",
  errorTitle: "Error",
  downloadFailed: "download-failed",
  downloadSuccessTitle: "downloaded",
  downloadSuccessDescription: "saved",
  downloadNoImage: "no-image",
};

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

beforeEach(() => {
  useTranslationsMock.mockImplementation(
    () =>
      ((key: string) => labels[key] ?? key) as ReturnType<
        typeof useTranslations
      >,
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

describe("DownloadButton (posts)", () => {
  test("originalImageUrl が指定されていれば DL 時はそちらを使う（WebP ではなく PNG）", async () => {
    render(
      <DownloadButton
        postId="post-1"
        imageUrl="https://cdn.example.com/x_display.webp"
        originalImageUrl="https://cdn.example.com/x.png"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
    });
    const [target] = mockShareOrDownload.mock.calls[0];
    expect(target).toEqual({
      id: "post-1",
      url: "https://cdn.example.com/x.png",
    });
  });

  test("originalImageUrl が未指定なら imageUrl に fallback する（既存挙動）", async () => {
    render(
      <DownloadButton
        postId="post-1"
        imageUrl="https://cdn.example.com/x.png"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
    });
    const [target] = mockShareOrDownload.mock.calls[0];
    expect(target.url).toBe("https://cdn.example.com/x.png");
  });

  test("originalImageUrl が null のときも imageUrl に fallback する", async () => {
    render(
      <DownloadButton
        postId="post-1"
        imageUrl="https://cdn.example.com/x.png"
        originalImageUrl={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
    });
    const [target] = mockShareOrDownload.mock.calls[0];
    expect(target.url).toBe("https://cdn.example.com/x.png");
  });
});

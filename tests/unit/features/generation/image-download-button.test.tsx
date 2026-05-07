/**
 * `ImageDownloadButton` の UI レイヤテスト。
 *
 * ロジック側（モバイル/PC 分岐・Web Share・エラー）は
 * `download-image.test.ts` で網羅済みなので、ここでは
 * - variant 切り替え（ghost = アイコンのみ / outline = ラベル付き）
 * - クリック時に共通ヘルパが呼ばれること
 * - 成功時のトースト表示と callbacks の呼び出し
 * - errorTitle 有無による失敗トーストの構造
 * - imageUrl が null/undefined の時の noImage トースト
 * の橋渡し挙動を検証する。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockShareOrDownload = jest.fn();
jest.mock("@/features/generation/lib/download-image", () => ({
  shareOrDownloadGeneratedImage: (...args: unknown[]) =>
    mockShareOrDownload(...args),
}));

import { ImageDownloadButton } from "@/features/generation/components/ImageDownloadButton";

const baseMessages = {
  accessDenied: "denied",
  fetchFailed: (s: string) => `failed:${s}`,
  failedFallback: "failed-fallback",
  successTitle: "success-title",
  successDescription: "success-description",
};

beforeEach(() => {
  mockToast.mockReset();
  mockShareOrDownload.mockReset();
  mockShareOrDownload.mockImplementation(async (_image, _msgs, callbacks) => {
    callbacks?.onDownloadSuccess?.();
  });
});

describe("ImageDownloadButton", () => {
  test("variant=ghost はアイコンのみ表示しラベル文字列を出さない", () => {
    render(
      <ImageDownloadButton
        imageUrl="https://example.com/x.png"
        id="post-1"
        variant="ghost"
        ariaLabel="Download"
        label="should-not-render"
        messages={baseMessages}
      />,
    );

    expect(screen.queryByText("should-not-render")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  test("variant=outline は label を表示する", () => {
    render(
      <ImageDownloadButton
        imageUrl="https://example.com/x.png"
        id="style-1"
        variant="outline"
        ariaLabel="Download"
        label="ダウンロード"
        messages={baseMessages}
      />,
    );

    expect(screen.getByText("ダウンロード")).toBeInTheDocument();
  });

  test("クリックすると共通ヘルパに id/url とコールバックを渡す", async () => {
    const onShareSuccess = jest.fn();
    const onDownloadSuccess = jest.fn();

    render(
      <ImageDownloadButton
        imageUrl="https://example.com/x.png"
        id="post-1"
        variant="ghost"
        ariaLabel="Download"
        messages={baseMessages}
        callbacks={{ onShareSuccess, onDownloadSuccess }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockShareOrDownload).toHaveBeenCalledTimes(1);
    });
    expect(mockShareOrDownload).toHaveBeenCalledWith(
      { id: "post-1", url: "https://example.com/x.png" },
      expect.objectContaining({
        accessDenied: "denied",
        fetchFailed: expect.any(Function),
      }),
      expect.objectContaining({
        onShareSuccess: expect.any(Function),
        onDownloadSuccess: expect.any(Function),
      }),
    );

    // download success path: 内部 toast + 呼び出し側 callback の双方が走る
    await waitFor(() => {
      expect(onDownloadSuccess).toHaveBeenCalledTimes(1);
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "success-title",
        description: "success-description",
      }),
    );
  });

  test("share success 時はトーストを出さず callback だけ呼ぶ", async () => {
    mockShareOrDownload.mockImplementationOnce(
      async (_image, _msgs, callbacks) => {
        callbacks?.onShareSuccess?.();
      },
    );
    const onShareSuccess = jest.fn();
    const onDownloadSuccess = jest.fn();

    render(
      <ImageDownloadButton
        imageUrl="https://example.com/x.png"
        id="style-1"
        variant="outline"
        label="DL"
        ariaLabel="Download"
        messages={baseMessages}
        callbacks={{ onShareSuccess, onDownloadSuccess }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(onShareSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onDownloadSuccess).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  test("失敗時 errorTitle 有り = title+description の destructive トースト", async () => {
    mockShareOrDownload.mockRejectedValueOnce(new Error("boom"));

    render(
      <ImageDownloadButton
        imageUrl="https://example.com/x.png"
        id="post-1"
        variant="ghost"
        ariaLabel="Download"
        messages={{ ...baseMessages, errorTitle: "Error" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "boom",
          variant: "destructive",
        }),
      );
    });
  });

  test("失敗時 errorTitle 無し = title が詳細メッセージのみ", async () => {
    mockShareOrDownload.mockRejectedValueOnce(new Error("boom"));

    render(
      <ImageDownloadButton
        imageUrl="https://example.com/x.png"
        id="style-1"
        variant="outline"
        label="DL"
        ariaLabel="Download"
        messages={baseMessages}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "boom",
          variant: "destructive",
        }),
      );
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.not.objectContaining({ description: expect.anything() }),
    );
  });

  test("imageUrl が null で errorTitle/noImage 揃っているとき noImage トースト、共通ヘルパは呼ばない", async () => {
    render(
      <ImageDownloadButton
        imageUrl={null}
        id="post-1"
        variant="ghost"
        ariaLabel="Download"
        messages={{
          ...baseMessages,
          errorTitle: "Error",
          noImage: "no-image",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "no-image",
          variant: "destructive",
        }),
      );
    });
    expect(mockShareOrDownload).not.toHaveBeenCalled();
  });

  test("imageUrl が null で noImage が未指定なら何も起こらない", async () => {
    render(
      <ImageDownloadButton
        imageUrl={undefined}
        id="style-1"
        variant="outline"
        label="DL"
        ariaLabel="Download"
        messages={baseMessages}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    // 非同期で何も起こらないことを確認するため、microtask を流して再確認
    await Promise.resolve();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockShareOrDownload).not.toHaveBeenCalled();
  });
});

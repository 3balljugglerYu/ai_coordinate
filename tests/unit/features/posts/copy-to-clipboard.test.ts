/** @jest-environment jsdom */

import { copyTextToClipboard } from "@/features/posts/lib/copy-to-clipboard";

const SAMPLE_TEXT = "Head: no hat, bare head\nHands: empty hands";

// navigator.userAgent をモック可能にする
function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    writable: true,
    configurable: true,
  });
}

function setupClipboardMock(writeText: jest.Mock | undefined) {
  if (writeText) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}

describe("copyTextToClipboard", () => {
  let execCommandMock: jest.Mock;
  let appendChildSpy: jest.SpyInstance;
  let removeChildSpy: jest.SpyInstance;

  beforeEach(() => {
    execCommandMock = jest.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;
    appendChildSpy = jest.spyOn(document.body, "appendChild");
    removeChildSpy = jest.spyOn(document.body, "removeChild");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("モバイルブラウザの場合", () => {
    beforeEach(() => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
      );
    });

    test("execCommand でコピーし、textarea をクリーンアップする", async () => {
      setupClipboardMock(jest.fn().mockResolvedValue(undefined));

      await copyTextToClipboard(SAMPLE_TEXT);

      expect(execCommandMock).toHaveBeenCalledWith("copy");
      // textarea が追加されて削除されたことを確認
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      expect(removeChildSpy).toHaveBeenCalledTimes(1);
      const textarea = appendChildSpy.mock.calls[0][0] as HTMLTextAreaElement;
      expect(textarea.value).toBe(SAMPLE_TEXT);
      expect(textarea.getAttribute("readonly")).toBe("");
    });

    test("execCommand 成功時は Clipboard API を呼ばない", async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      setupClipboardMock(writeText);

      await copyTextToClipboard(SAMPLE_TEXT);

      expect(execCommandMock).toHaveBeenCalledWith("copy");
      expect(writeText).not.toHaveBeenCalled();
    });

    test("execCommand 失敗時は Clipboard API にフォールバックする", async () => {
      execCommandMock.mockReturnValue(false);
      const writeText = jest.fn().mockResolvedValue(undefined);
      setupClipboardMock(writeText);

      await copyTextToClipboard(SAMPLE_TEXT);

      expect(writeText).toHaveBeenCalledWith(SAMPLE_TEXT);
    });

    test("execCommand も Clipboard API も失敗した場合はエラーを投げる", async () => {
      execCommandMock.mockReturnValue(false);
      setupClipboardMock(undefined);

      await expect(copyTextToClipboard(SAMPLE_TEXT)).rejects.toThrow(
        "Failed to copy prompt"
      );
    });

    test("iOS Safari の UserAgent でも execCommand を使用する", async () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      );
      setupClipboardMock(jest.fn().mockResolvedValue(undefined));

      await copyTextToClipboard(SAMPLE_TEXT);

      expect(execCommandMock).toHaveBeenCalledWith("copy");
    });
  });

  describe("デスクトップブラウザの場合", () => {
    beforeEach(() => {
      mockUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      );
    });

    test("Clipboard API でコピーする", async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      setupClipboardMock(writeText);

      await copyTextToClipboard(SAMPLE_TEXT);

      expect(writeText).toHaveBeenCalledWith(SAMPLE_TEXT);
      expect(execCommandMock).not.toHaveBeenCalled();
    });

    test("Clipboard API が存在しない場合はエラーを投げる", async () => {
      setupClipboardMock(undefined);

      await expect(copyTextToClipboard(SAMPLE_TEXT)).rejects.toThrow(
        "Failed to copy prompt"
      );
    });

    test("Clipboard API が例外を投げた場合はエラーが伝播する", async () => {
      const writeText = jest
        .fn()
        .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
      setupClipboardMock(writeText);

      await expect(copyTextToClipboard(SAMPLE_TEXT)).rejects.toThrow("denied");
    });
  });
});

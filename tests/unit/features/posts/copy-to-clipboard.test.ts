/** @jest-environment jsdom */

import { copyTextToClipboard } from "@/lib/clipboard";

const SAMPLE_TEXT = "Head: no hat, bare head\nHands: empty hands";

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

  test("Clipboard API でコピーする", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setupClipboardMock(writeText);

    await copyTextToClipboard(SAMPLE_TEXT);

    expect(writeText).toHaveBeenCalledWith(SAMPLE_TEXT);
    expect(execCommandMock).not.toHaveBeenCalled();
  });

  test("Clipboard API が失敗した場合は execCommand にフォールバックする", async () => {
    const writeText = jest
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    setupClipboardMock(writeText);

    await copyTextToClipboard(SAMPLE_TEXT);

    expect(writeText).toHaveBeenCalledWith(SAMPLE_TEXT);
    expect(execCommandMock).toHaveBeenCalledWith("copy");
  });

  test("Clipboard API が存在しない場合は execCommand にフォールバックする", async () => {
    setupClipboardMock(undefined);

    await copyTextToClipboard(SAMPLE_TEXT);

    expect(execCommandMock).toHaveBeenCalledWith("copy");
    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
    const textarea = appendChildSpy.mock.calls[0][0] as HTMLTextAreaElement;
    expect(textarea.value).toBe(SAMPLE_TEXT);
    expect(textarea.getAttribute("readonly")).toBe("");
  });

  test("execCommand でコピーし、textarea をクリーンアップする", async () => {
    setupClipboardMock(undefined);

    await copyTextToClipboard(SAMPLE_TEXT);

    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
  });

  test("Clipboard API も execCommand も失敗した場合はエラーを投げる", async () => {
    setupClipboardMock(undefined);
    execCommandMock.mockReturnValue(false);

    await expect(copyTextToClipboard(SAMPLE_TEXT)).rejects.toThrow(
      "Failed to copy to clipboard"
    );
  });
});

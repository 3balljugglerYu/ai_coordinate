/**
 * 「押してから通信でテキストを取ってコピーする」経路のテスト。
 *
 * ここが誤ると iOS Safari でコピーが必ず失敗する。await を挟むと
 * ユーザー操作の権限が切れ、writeText も execCommand も拒否されるため、
 * ClipboardItem に Promise を渡す形でなければならない。
 */

import { copyTextFromPromise } from "@/lib/clipboard";

describe("copyTextFromPromise", () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = (globalThis as { ClipboardItem?: unknown })
    .ClipboardItem;

  function setClipboard(value: unknown) {
    Object.defineProperty(navigator, "clipboard", {
      value,
      configurable: true,
      writable: true,
    });
  }

  function setClipboardItem(value: unknown) {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = value;
  }

  afterEach(() => {
    setClipboard(originalClipboard);
    setClipboardItem(originalClipboardItem);
    jest.restoreAllMocks();
  });

  test("ClipboardItem には解決前の Promise を渡す(権限を保つため)", async () => {
    let resolveText: ((value: string) => void) | undefined;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });

    const write = jest.fn().mockResolvedValue(undefined);
    setClipboard({ write, writeText: jest.fn() });
    const itemArgs: Record<string, unknown>[] = [];
    setClipboardItem(
      class {
        constructor(items: Record<string, unknown>) {
          itemArgs.push(items);
        }
      }
    );

    const copyPromise = copyTextFromPromise(textPromise);

    // テキストが解決する前に ClipboardItem が作られていること
    expect(itemArgs).toHaveLength(1);
    expect(itemArgs[0]["text/plain"]).toBeInstanceOf(Promise);

    resolveText?.("コピーされる本文");
    await copyPromise;

    expect(write).toHaveBeenCalledTimes(1);
  });

  test("ClipboardItem が無ければ従来の writeText へ倒す", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    setClipboardItem(undefined);

    await copyTextFromPromise(Promise.resolve("本文"));

    expect(writeText).toHaveBeenCalledWith("本文");
  });

  test("ClipboardItem 経路が拒否されたら従来経路へ倒す", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({
      write: jest.fn().mockRejectedValue(new Error("NotAllowedError")),
      writeText,
    });
    setClipboardItem(class {});

    await copyTextFromPromise(Promise.resolve("本文"));

    expect(writeText).toHaveBeenCalledWith("本文");
  });

  test("テキストの取得に失敗したら例外を投げる(呼び出し側がエラー表示できる)", async () => {
    setClipboard({ writeText: jest.fn() });
    setClipboardItem(undefined);

    await expect(
      copyTextFromPromise(Promise.reject(new Error("fetch failed")))
    ).rejects.toThrow("fetch failed");
  });
});

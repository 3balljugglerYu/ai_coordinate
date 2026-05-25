/**
 * @jest-environment jsdom
 */

import { fetchSourceImageAsUploadedImage } from "@/features/generation/lib/source-image-to-file";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 800;
  naturalHeight = 1000;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

// preload で onerror を発火させる Image 実装
class FakeImageThatFails {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onerror?.());
  }
}

// preload で何も発火させない (timeout 検証用) Image 実装
class FakeImageThatHangs {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    // 発火しない → timeout に任せる
  }
}

// preload 完了時に naturalWidth/Height が 0 のままになる Image 実装
class FakeImageNoNaturalSize {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  jest.restoreAllMocks();
  // URL.createObjectURL / revokeObjectURL not in jsdom by default
  (global.URL as unknown as { createObjectURL: jest.Mock }).createObjectURL =
    jest.fn(() => "blob:fake-url");
  (global.URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL =
    jest.fn();
  // Image globals
  (
    global as unknown as { Image: typeof FakeImage }
  ).Image = FakeImage;
});

describe("fetchSourceImageAsUploadedImage", () => {
  test("URL を fetch → Blob → File 化し、naturalWidth/Height を返す", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response);

    const result = await fetchSourceImageAsUploadedImage(
      "https://cdn.example/img.jpg",
      { fileNameHint: "test" },
    );

    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe("test.jpeg");
    expect(result.file.type).toBe("image/jpeg");
    expect(result.previewUrl).toBe("blob:fake-url");
    expect(result.width).toBe(800);
    expect(result.height).toBe(1000);
  });

  test("HTTP 失敗時は例外", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      blob: async () => new Blob(),
    } as unknown as Response);
    await expect(
      fetchSourceImageAsUploadedImage("https://cdn.example/x"),
    ).rejects.toThrow(/fetch failed: 500/);
  });

  test("Blob の type が空のとき png にフォールバックする", async () => {
    const blob = new Blob(["x"]); // type=""
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response);

    const result = await fetchSourceImageAsUploadedImage(
      "https://cdn.example/no-mime",
    );
    expect(result.file.type).toBe("image/png");
    expect(result.file.name).toMatch(/\.png$/);
  });

  test("preload で onerror が走ったら revoke + throw", async () => {
    (global as unknown as { Image: typeof FakeImageThatFails }).Image =
      FakeImageThatFails;
    const blob = new Blob(["x"], { type: "image/png" });
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response);

    const revokeSpy = (
      global.URL as unknown as { revokeObjectURL: jest.Mock }
    ).revokeObjectURL;

    await expect(
      fetchSourceImageAsUploadedImage("https://cdn.example/broken.png"),
    ).rejects.toThrow(/image load error/);
    // 例外時に preview URL が revoke されること
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  test("preload が timeout した場合 revoke + throw", async () => {
    jest.useFakeTimers();
    (global as unknown as { Image: typeof FakeImageThatHangs }).Image =
      FakeImageThatHangs;
    const blob = new Blob(["x"], { type: "image/png" });
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response);

    const revokeSpy = (
      global.URL as unknown as { revokeObjectURL: jest.Mock }
    ).revokeObjectURL;

    const promise = fetchSourceImageAsUploadedImage(
      "https://cdn.example/hang.png",
      { preloadTimeoutMs: 100 },
    );
    // microtask の fetch 解決を待ち、その後 timer を進めて timeout 発火
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow(/preload timeout/);
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
    jest.useRealTimers();
  });

  test("naturalWidth / Height が 0 のとき FALLBACK_DIMENSION (1024) を返す", async () => {
    (global as unknown as { Image: typeof FakeImageNoNaturalSize }).Image =
      FakeImageNoNaturalSize;
    const blob = new Blob(["x"], { type: "image/jpeg" });
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as unknown as Response);

    const result = await fetchSourceImageAsUploadedImage(
      "https://cdn.example/no-size.jpg",
    );
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });
});

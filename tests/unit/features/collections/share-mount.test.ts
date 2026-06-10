/**
 * `share-mount` ライブラリのテスト。
 *
 * buildPublicMountUrl / trackMountShareEvent は MountShareButton(/m ページ)と
 * CollectionProgressModal(マイページ・コンプリート演出)のシェア導線
 * (ShareLinkButton 経由)が使う。URL 組立の互換(?v= バージョニング・旧URL
 * フォールバック)と、計測のベストエフォート性(失敗握りつぶし)を固定する。
 */

import {
  buildPublicMountUrl,
  extractMountVersionFromUrl,
  trackMountShareEvent,
} from "@/features/collections/lib/share-mount";

const origin = window.location.origin;
const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true });
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("extractMountVersionFromUrl", () => {
  test("mount-{ts}.png からタイムスタンプを抜き、無ければ null", () => {
    expect(
      extractMountVersionFromUrl("https://cdn/x/mount-123.png?v=9"),
    ).toBe("123");
    expect(extractMountVersionFromUrl("https://cdn/x/legacy.png")).toBeNull();
    expect(extractMountVersionFromUrl(null)).toBeNull();
    expect(extractMountVersionFromUrl(undefined)).toBeNull();
  });
});

describe("buildPublicMountUrl", () => {
  test("mount-{ts}.png 形式の画像URLからバージョン付き公開URLを組み立てる", () => {
    expect(
      buildPublicMountUrl(
        "c1",
        "https://cdn.example.com/mounts/mount-1717999999999.png?x=1",
      ),
    ).toBe(`${origin}/m/c1?v=1717999999999`);
  });

  test("タイムスタンプの無い旧URLや null ではバージョン無しURLになる", () => {
    expect(buildPublicMountUrl("c1", "https://cdn.example.com/legacy.png")).toBe(
      `${origin}/m/c1`,
    );
    expect(buildPublicMountUrl("c1", null)).toBe(`${origin}/m/c1`);
    expect(buildPublicMountUrl("c1", undefined)).toBe(`${origin}/m/c1`);
  });
});

describe("trackMountShareEvent", () => {
  test("share-event エンドポイントへ completionId 付きで POST する", async () => {
    trackMountShareEvent("c9");

    await waitForMicrotasks();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/collections/share-event",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionId: "c9" }),
      }),
    );
  });

  test("fetch が失敗しても例外にしない(ベストエフォート計測)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    expect(() => trackMountShareEvent("c1")).not.toThrow();
    // fire-and-forget の reject が unhandled rejection にならないこと
    await waitForMicrotasks();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

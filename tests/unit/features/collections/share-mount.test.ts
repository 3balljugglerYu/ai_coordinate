/**
 * `share-mount` ライブラリのテスト。
 *
 * buildPublicMountUrl / trackMountShareEvent は MountShareButton(/m ページ)と
 * CollectionProgressModal(マイページ・コンプリート演出)のシェア導線
 * (ShareLinkButton 経由)が使う。URL 組立の互換(?v= バージョニング・旧URL
 * フォールバック)と、計測のベストエフォート性(失敗握りつぶし)を固定する。
 */

import {
  buildPublicBookUrl,
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

describe("buildPublicBookUrl", () => {
  test("book ビューの公開URLを組み立てる(キャッシュバスター無し)", () => {
    expect(buildPublicBookUrl("c1")).toBe(`${origin}/m/c1/book`);
  });

  test("categoryKey を渡すと signup_source が付く", () => {
    expect(buildPublicBookUrl("c1", "travel_to_australia")).toBe(
      `${origin}/m/c1/book?signup_source=travel_to_australia`,
    );
  });
});

describe("シェアURLの流入元タグ(計測①)", () => {
  /*
    シェアURL → 訪問 → 新規登録 を繋ぐための first-touch タグ。
    着地時に SignupSourceCapture が cookie へ保存し、登録時に
    profiles.signup_source に残る。神コレ・イタリアで取れなかった指標。
  */
  test("バージョンとタグが両方付く", () => {
    expect(
      buildPublicMountUrl(
        "c1",
        "https://cdn.example.com/mounts/mount-1717999999999.png",
        "fashion_magazine_summer",
      ),
    ).toBe(
      `${origin}/m/c1?v=1717999999999&signup_source=fashion_magazine_summer`,
    );
  });

  test("バージョンが無くてもタグだけ付く", () => {
    expect(buildPublicMountUrl("c1", null, "travel_to_australia")).toBe(
      `${origin}/m/c1?signup_source=travel_to_australia`,
    );
  });

  test("categoryKey 省略時は従来どおりタグを付けない(後方互換)", () => {
    expect(buildPublicMountUrl("c1", null)).toBe(`${origin}/m/c1`);
    expect(buildPublicMountUrl("c1", null, null)).toBe(`${origin}/m/c1`);
  });

  test("書式に合わない key はタグごと省略する(不正な値を URL に載せない)", () => {
    // DB の CHECK(^[a-z0-9_-]{1,40}$)と同じ書式。大文字・記号・41文字以上は落とす
    expect(buildPublicMountUrl("c1", null, "Travel To Australia")).toBe(
      `${origin}/m/c1`,
    );
    expect(buildPublicMountUrl("c1", null, "a".repeat(41))).toBe(
      `${origin}/m/c1`,
    );
  });

  test("実在するカテゴリ key はすべて書式を満たす", () => {
    // 接頭辞を付けない設計の根拠。最長でも 38 文字で上限 40 に収まる
    const keys = [
      "travel_to_italy",
      "travel_to_australia",
      "fashion_magazine_summer",
      "kotowaza_dictionary",
      "kotowaza_dictionary_2",
      "collectible_wafer_sticker",
      "collectible_wafer_sticker_god_6p",
      "collectible_wafer_sticker_god_petit_6p",
    ];
    for (const key of keys) {
      expect(buildPublicMountUrl("c1", null, key)).toBe(
        `${origin}/m/c1?signup_source=${key}`,
      );
    }
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

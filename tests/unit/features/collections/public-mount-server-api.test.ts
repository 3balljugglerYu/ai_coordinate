/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCollectionBookByToken,
  withOgpVersion,
} from "@/features/collections/lib/public-mount-server-api";

describe("withOgpVersion", () => {
  it("null はそのまま null を返す", () => {
    expect(withOgpVersion(null)).toBeNull();
  });

  it("クエリ無しURLに ?v=N を付与する", () => {
    expect(
      withOgpVersion("https://example.supabase.co/storage/v1/object/public/generated-images/a/ogp-123.png"),
    ).toBe(
      "https://example.supabase.co/storage/v1/object/public/generated-images/a/ogp-123.png?v=2",
    );
  });

  it("既存クエリがあるURLには & で追加し、既存パラメータを保持する", () => {
    expect(withOgpVersion("https://example.com/img.png?foo=1")).toBe(
      "https://example.com/img.png?foo=1&v=2",
    );
  });

  it("既に v がある場合は重複させず上書きする", () => {
    expect(withOgpVersion("https://example.com/img.png?v=1")).toBe(
      "https://example.com/img.png?v=2",
    );
  });

  it("URLとして解釈できない文字列はそのまま返す", () => {
    expect(withOgpVersion("not-a-url")).toBe("not-a-url");
  });
});

describe("getCollectionBookByToken", () => {
  const TOKEN = "0f000000-0000-4000-8000-000000000001";
  const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

  function mockQueryResult(result: { data: unknown; error: unknown }) {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.maybeSingle = jest.fn(async () => result);
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => chain),
    });
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  });

  it("UUID 形式でないトークンは DB へ問い合わせず null", async () => {
    (createAdminClient as jest.Mock).mockClear();
    expect(await getCollectionBookByToken("not-a-uuid")).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("完走データをマップし、抽選設定(lottery_target/表示期間)を含めて返す", async () => {
    mockQueryResult({
      data: {
        id: TOKEN,
        user_id: "user-1",
        category_key: "fashion_magazine_summer",
        mount_image_path: "u/mount-123.png",
        completed_at: "2026-08-08T10:00:00Z",
        book_page_paths: ["u/p1.png", "u/p2.png"],
        preset_categories: {
          display_name_ja: "うちの子のファッション雑誌：夏",
          book_cover_path: null,
          book_cover_overlay: false,
          book_back_cover_mode: "last_image",
          output_aspect_ratio_mode: null,
          lottery_target: true,
          collection_display_starts_at: "2026-08-08T10:00:00Z",
          collection_display_ends_at: "2026-08-16T13:00:00Z",
        },
      },
      error: null,
    });

    const book = await getCollectionBookByToken(TOKEN);
    expect(book).not.toBeNull();
    expect(book?.categoryKey).toBe("fashion_magazine_summer");
    expect(book?.pageImageUrls).toHaveLength(2);
    expect(book?.lotteryTarget).toBe(true);
    expect(book?.collectionDisplayStartsAt).toBe("2026-08-08T10:00:00Z");
    expect(book?.collectionDisplayEndsAt).toBe("2026-08-16T13:00:00Z");
  });

  it("カテゴリ設定が欠けている場合は抽選 OFF(false/null)にフォールバックする", async () => {
    mockQueryResult({
      data: {
        id: TOKEN,
        user_id: "user-1",
        category_key: "travel_to_italy",
        mount_image_path: null,
        completed_at: null,
        book_page_paths: ["u/p1.png"],
        preset_categories: null,
      },
      error: null,
    });

    const book = await getCollectionBookByToken(TOKEN);
    expect(book?.lotteryTarget).toBe(false);
    expect(book?.collectionDisplayStartsAt).toBeNull();
    expect(book?.collectionDisplayEndsAt).toBeNull();
  });

  it("book_page_paths が空なら null", async () => {
    mockQueryResult({
      data: {
        id: TOKEN,
        user_id: "user-1",
        category_key: "travel_to_italy",
        mount_image_path: null,
        completed_at: null,
        book_page_paths: [],
        preset_categories: null,
      },
      error: null,
    });
    expect(await getCollectionBookByToken(TOKEN)).toBeNull();
  });
});

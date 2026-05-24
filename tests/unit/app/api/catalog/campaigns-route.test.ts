/** @jest-environment node */

jest.mock("@/features/catalog/lib/get-public-catalog", () => ({
  getCachedPublishedCampaigns: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({})),
}));

jest.mock("@/features/catalog/lib/repository", () => ({
  createCatalogSignedUrls: jest.fn(),
}));

jest.mock("@/lib/api/route-locale", () => ({
  getRouteLocale: jest.fn(() => "ja"),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/catalog/campaigns/route";
import { getCachedPublishedCampaigns } from "@/features/catalog/lib/get-public-catalog";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";

const mockGetCachedPublishedCampaigns =
  getCachedPublishedCampaigns as jest.MockedFunction<
    typeof getCachedPublishedCampaigns
  >;
const mockCreateCatalogSignedUrls =
  createCatalogSignedUrls as jest.MockedFunction<typeof createCatalogSignedUrls>;

function makeRequest() {
  return new NextRequest("http://localhost/api/catalog/campaigns");
}

function makeCampaign(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "camp-1",
    slug: "slug-1",
    title: "Campaign 1",
    description: "desc",
    theme_hashtag: "tag",
    cover_storage_path: "covers/c1.webp",
    start_at: null,
    end_at: null,
    display_order: 0,
    status: "published",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  } as Parameters<typeof mockGetCachedPublishedCampaigns.mockResolvedValue>[0] extends Array<infer T>
    ? T
    : never;
}

describe("GET /api/catalog/campaigns", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("正常系: 表紙ありと表紙なし (null / 空文字) を mix した一覧を返す", async () => {
    mockGetCachedPublishedCampaigns.mockResolvedValue([
      makeCampaign({ id: "c1", cover_storage_path: "covers/c1.webp" }),
      makeCampaign({ id: "c2", cover_storage_path: null }),
      makeCampaign({ id: "c3", cover_storage_path: "" }),
      makeCampaign({ id: "c4", cover_storage_path: "covers/c4.webp" }),
    ]);
    mockCreateCatalogSignedUrls.mockResolvedValue({
      urls: ["https://signed/c1", null],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; cover_image_url: string | null }>;
      signed_url_ttl_seconds: number;
    };

    // 4 件すべて返り、cover_image_url の解決状態が分岐ごとに正しいこと
    expect(body.items.map((i) => [i.id, i.cover_image_url])).toEqual([
      ["c1", "https://signed/c1"],
      ["c2", null], // cover_storage_path が null
      ["c3", null], // 空文字 (filter で除外され、Map にも入らない)
      ["c4", null], // urls 側で null (署名失敗)
    ]);
    expect(body.signed_url_ttl_seconds).toBe(60 * 30);

    // signed URL 発行は空でない path 2 件のみ
    expect(mockCreateCatalogSignedUrls).toHaveBeenCalledTimes(1);
    const passedPaths = mockCreateCatalogSignedUrls.mock.calls[0]![1];
    expect(passedPaths).toEqual(["covers/c1.webp", "covers/c4.webp"]);
  });

  test("空一覧でも 200 と空配列を返す", async () => {
    mockGetCachedPublishedCampaigns.mockResolvedValue([]);
    mockCreateCatalogSignedUrls.mockResolvedValue({ urls: [] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  test("内部例外は 500 / CATALOG_LIST_FAILED にハンドリングされる", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetCachedPublishedCampaigns.mockRejectedValue(new Error("boom"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { errorCode?: string };
    expect(body.errorCode).toBe("CATALOG_LIST_FAILED");
    consoleSpy.mockRestore();
  });
});

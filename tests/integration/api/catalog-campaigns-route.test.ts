/** @jest-environment node */

jest.mock("@/lib/api/route-locale", () => ({
  getRouteLocale: () => "ja",
}));

const mockGetCachedPublishedCampaigns = jest.fn();
jest.mock("@/features/catalog/lib/get-public-catalog", () => ({
  getCachedPublishedCampaigns: () => mockGetCachedPublishedCampaigns(),
  CATALOG_CACHE_TAGS: {
    campaigns: "catalog-campaigns",
    campaign: (slug: string) => `catalog-campaign-${slug}`,
    entry: (id: string) => `catalog-entry-${id}`,
  },
}));

const mockCreateSignedUrls = jest.fn();
jest.mock("@/features/catalog/lib/repository", () => ({
  createCatalogSignedUrls: (...args: unknown[]) => mockCreateSignedUrls(...args),
}));

const mockCreateAdminClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import { GET } from "@/app/api/catalog/campaigns/route";

function createRequest(): never {
  const request = new Request("http://localhost/api/catalog/campaigns");
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as never;
}

describe("GET /api/catalog/campaigns", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdminClient.mockReturnValue({});
  });

  test("公開中の企画を items として返し signed URL を解決する", async () => {
    mockGetCachedPublishedCampaigns.mockResolvedValue([
      {
        id: "c1",
        slug: "cats",
        title: "Cat Catalog",
        description: "cats",
        theme_hashtag: "ペルスタ猫",
        start_at: null,
        end_at: null,
        display_order: 0,
        cover_storage_path: "covers/cats.jpg",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        id: "c2",
        slug: "hats",
        title: "Hats",
        description: null,
        theme_hashtag: null,
        start_at: null,
        end_at: null,
        display_order: 1,
        cover_storage_path: null,
        created_at: "2026-01-03",
        updated_at: "2026-01-04",
      },
    ]);
    mockCreateSignedUrls.mockResolvedValue({
      urls: ["https://signed/cats.jpg"],
      error: null,
    });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].cover_image_url).toBe("https://signed/cats.jpg");
    expect(body.items[1].cover_image_url).toBeNull();
    // signed URL は cover_storage_path がある分だけ要求される
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(
      {},
      ["covers/cats.jpg"],
      1800,
    );
  });

  test("getCachedPublishedCampaigns が throw した場合 500 を返す", async () => {
    mockGetCachedPublishedCampaigns.mockRejectedValue(new Error("db down"));
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("CATALOG_LIST_FAILED");
    consoleSpy.mockRestore();
  });
});

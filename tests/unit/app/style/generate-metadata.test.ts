import { generateMetadata } from "@/app/(app)/style/page";
import { getPublishedStylePreset } from "@/features/style-presets/lib/get-public-style-presets";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { isUserStylesPubliclyEnabled } from "@/lib/env";

// generateMetadata だけを検証するため、default export が引き込む重いクライアント
// コンポーネント群はスタブ化する(メタデータ生成には無関係)。
jest.mock("@/features/style/components/StyleTourButton", () => ({
  StyleTourButton: () => null,
}));
jest.mock("@/features/style/components/StylePageBody", () => ({
  StylePageBody: () => null,
}));
jest.mock("@/features/style/components/StyleTotalGenerationCount", () => ({
  StyleTotalGenerationCount: () => null,
}));
jest.mock("@/features/style/components/StylePageHeading", () => ({
  StylePageHeading: () => null,
}));
jest.mock("@/lib/env", () => ({
  isUserStylesPubliclyEnabled: jest.fn(() => false),
}));

jest.mock("next-intl/server", () => ({
  getLocale: jest.fn(async () => "ja"),
  getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock("@/lib/metadata", () => ({
  createMarketingPageMetadata: jest.fn(() => ({
    title: "pageTitle",
    description: "pageDescription",
    openGraph: { type: "website" },
    twitter: { card: "summary_large_image" },
  })),
}));

jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePreset: jest.fn(),
}));

const mockGetPreset = getPublishedStylePreset as jest.MockedFunction<
  typeof getPublishedStylePreset
>;

const DEFAULT_OG = "/og/one-tap-style.png";

function firstOgImageUrl(meta: Awaited<ReturnType<typeof generateMetadata>>) {
  const images = meta.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  return first && typeof first === "object" && "url" in first
    ? String(first.url)
    : String(first);
}

describe("style page generateMetadata", () => {
  beforeEach(() => {
    mockGetPreset.mockReset();
  });

  it("?style=<id> が公開Styleに解決するとサムネイルをOGP画像にする", async () => {
    mockGetPreset.mockResolvedValue({
      id: "abc",
      title: "オリジナル戦車を作ろう",
      thumbnailImageUrl: "https://cdn.example.com/thumb.webp",
      thumbnailWidth: 1280,
      thumbnailHeight: 853,
      // generateMetadata が参照するのは上記5フィールドのみ。他必須フィールドは
      // 検証に不要なため、部分モックを公開サマリ型へアサートする。
    } as unknown as StylePresetPublicSummary);

    const meta = await generateMetadata({
      searchParams: Promise.resolve({ style: "abc" }),
    });

    expect(mockGetPreset).toHaveBeenCalledWith("abc");
    expect(firstOgImageUrl(meta)).toBe("https://cdn.example.com/thumb.webp");
    expect(meta.twitter?.images).toEqual(["https://cdn.example.com/thumb.webp"]);
    expect(meta.title).toBe("オリジナル戦車を作ろう");
  });

  it("style が非公開/存在しない場合は既定OGへフォールバックする", async () => {
    mockGetPreset.mockResolvedValue(null);

    const meta = await generateMetadata({
      searchParams: Promise.resolve({ style: "missing" }),
    });

    expect(firstOgImageUrl(meta)).toBe(DEFAULT_OG);
    expect(meta.twitter?.images).toEqual([DEFAULT_OG]);
  });

  it("style パラメータが無い場合は既定OGで、preset取得を呼ばない", async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(mockGetPreset).not.toHaveBeenCalled();
    expect(firstOgImageUrl(meta)).toBe(DEFAULT_OG);
  });
});

describe("generateMetadata(/style): 一般公開後の名前", () => {
  const mockPubliclyEnabled = isUserStylesPubliclyEnabled as jest.MockedFunction<
    typeof isUserStylesPubliclyEnabled
  >;
  const mockCreateMetadata = createMarketingPageMetadata as jest.MockedFunction<
    typeof createMarketingPageMetadata
  >;

  afterEach(() => {
    mockPubliclyEnabled.mockReturnValue(false);
  });

  test("公開前は One-Tap Style のまま(運営だけの段階では検索向けの名前を変えない)", async () => {
    mockGetPreset.mockResolvedValue(null);

    await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(mockCreateMetadata).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "pageTitle" }),
    );
  });

  test("一般公開後は Persta ORIGINAL にそろえる", async () => {
    mockPubliclyEnabled.mockReturnValue(true);
    mockGetPreset.mockResolvedValue(null);

    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(mockCreateMetadata).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "pageTitleRevamp" }),
    );
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ alt: "pageTitleRevamp | Persta.AI" }),
    ]);
  });
});


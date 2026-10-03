/**
 * カタログ刷新後の /style(2026-10-01 ユーザー決定)。
 *
 * 刷新後(公開前は運営だけ)はこの画面を使わず、Perstaのカタログ(/styles)へ移す。
 * アプリ内のリンク・共有URL・ブックマークのどれから来ても、ここで一括して移る。
 * 刷新前(一般の利用者)は今のまま。
 */

const redirectMock = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));
jest.mock("next/server", () => ({ connection: jest.fn(async () => {}) }));
jest.mock("next-intl/server", () => ({
  getLocale: jest.fn(async () => "ja"),
  getTranslations: jest.fn(async () => (key: string) => key),
}));

const mockGetUser = jest.fn();
jest.mock("@/lib/auth", () => ({ getUser: () => mockGetUser() }));

const mockAvailable = jest.fn();
jest.mock("@/lib/env", () => ({
  isAdminViewer: () => false,
  isUserStylesAvailable: (userId: string | null) => mockAvailable(userId),
}));

const mockPresets = jest.fn();
jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePresets: () => mockPresets(),
}));

// 刷新前に進んだ先の重い依存は、ここでは描画しないので空にしておく
jest.mock("@/components/RefreshOnMount", () => ({ RefreshOnMount: () => null }));
jest.mock("@/features/style/components/StylePageClient", () => ({ StylePageClient: () => null }));
jest.mock("@/features/generation/components/GuestGenerationTrialCta", () => ({
  GuestGenerationTrialCta: () => null,
}));
jest.mock("@/features/generation/components/CachedGeneratedImageGallery", () => ({
  CachedGeneratedImageGallery: () => null,
}));
jest.mock("@/features/credits/components/CachedGenerationPercoinBalance", () => ({
  CachedGenerationPercoinBalance: () => null,
}));
jest.mock("@/features/generation/components/GeneratedImageGallerySkeleton", () => ({
  GeneratedImageGallerySkeleton: () => null,
}));
jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  GenerationStateProvider: () => null,
}));
jest.mock("@/features/my-page/lib/server-api", () => ({
  getUserProfileServer: jest.fn(async () => null),
}));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    from: () => ({ select: async () => ({ data: [] }) }),
  })),
}));
jest.mock("@/features/collections/lib/collection-unlock-server", () => ({
  resolveCollectionUnlockContext: jest.fn(),
}));
jest.mock("@/features/collections/lib/generated-preset-ids", () => ({
  getGeneratedCollectionPresetIds: jest.fn(async () => []),
}));
jest.mock("@/features/style/lib/style-popularity", () => ({
  getStyleGenerateCounts: jest.fn(async () => ({})),
  getStyleGenerateTotalCounts: jest.fn(async () => ({})),
}));

import { StylePageBody } from "@/features/style/components/StylePageBody";

const PRESETS = [
  {
    id: "preset-1",
    slug: "summer-marine",
    category: { sequentialUnlock: false, unlockPrerequisiteKey: null },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: "admin-1" });
  mockPresets.mockResolvedValue(PRESETS);
});

describe("StylePageBody(カタログ刷新後)", () => {
  beforeEach(() => mockAvailable.mockReturnValue(true));

  test("Perstaのカタログ(/styles)へ移す", async () => {
    await expect(StylePageBody({})).rejects.toThrow("NEXT_REDIRECT:/ja/styles");
    expect(mockAvailable).toHaveBeenCalledWith("admin-1");
  });

  test("?style= があれば、そのスタイルの紹介ページへ移す", async () => {
    await expect(
      StylePageBody({ searchParams: Promise.resolve({ style: "preset-1" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/ja/styles/summer-marine");
  });

  test("一覧に無いスタイル(未公開など)は、存在を教えずカタログへ移す", async () => {
    await expect(
      StylePageBody({ searchParams: Promise.resolve({ style: "hidden-preset" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/ja/styles");
    expect(redirectMock).toHaveBeenCalledWith("/ja/styles");
  });

  test("未ログインでも移す(公開後)", async () => {
    mockGetUser.mockResolvedValue(null);

    await expect(StylePageBody({})).rejects.toThrow("NEXT_REDIRECT:/ja/styles");
    expect(mockAvailable).toHaveBeenCalledWith(null);
  });
});

describe("StylePageBody(一般の利用者)", () => {
  test("今のまま、移さない", async () => {
    mockAvailable.mockReturnValue(false);

    await StylePageBody({ searchParams: Promise.resolve({ style: "preset-1" }) });

    expect(redirectMock).not.toHaveBeenCalled();
  });
});

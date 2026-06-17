/** @jest-environment node */

/**
 * `collection-progress-repository` の progress-modal フィールド結合テスト。
 *
 * getCollectionProgressForUser は
 *  1) RPC get_collection_progress_for_user でシリーズ進捗行を取得し mapProgressRow、
 *  2) preset_categories から progress_modal_* / character / colors を引いて結合、
 *  3) 集めたシール画像と completion_id を付与する。
 * ここでは progress_modal_*(frame/slots/center/button + ring/badge/text/bg color)が
 * CollectionProgress に正しく結合されることを検証する。
 * 外部依存(admin client / 公開URL組立 / 代表画像)はモックする。
 */

const createAdminClientMock = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const buildPublicGeneratedImageUrlMock = jest.fn(
  (path: string | null): string | null =>
    path ? `https://cdn.example.com/public/${path}` : null,
);
jest.mock(
  "@/features/collections/lib/public-mount-server-api",
  () => ({
    buildPublicGeneratedImageUrl: (path: string | null) =>
      buildPublicGeneratedImageUrlMock(path),
  }),
);

const getRepresentativeImagesForCategoryMock = jest.fn();
jest.mock("@/features/collections/lib/representative-images", () => ({
  getRepresentativeImagesForCategory: (...args: unknown[]) =>
    getRepresentativeImagesForCategoryMock(...args),
}));

import { getCollectionProgressForUser } from "@/features/collections/lib/collection-progress-repository";

const PROGRESS_ROW = {
  category_id: "cat-1",
  category_key: "db_driven_category",
  display_name_ja: "DB駆動",
  display_name_en: "DB Driven",
  completion_threshold: 6,
  unique_outfit_count: 2,
  is_completed: false,
  mount_status: null,
  mount_image_path: null,
  completed_at: null,
};

const PRESET_CATEGORY_ROW = {
  id: "cat-1",
  collection_character_path: "characters/char-1.png",
  mount_template_width: 1086,
  mount_template_height: 1448,
  progress_modal_frame_path: "frames/frame-1.webp",
  progress_modal_frame_width: 1086,
  progress_modal_frame_height: 1448,
  progress_modal_slots: [
    { x: 0.1, y: 0.7, w: 0.13, h: 0.13 },
    { x: 0.3, y: 0.7, w: 0.13, h: 0.13 },
  ],
  progress_modal_button: { x: 0.1, y: 0.85, w: 0.8, h: 0.09 },
  progress_modal_center: { x: 0.3, y: 0.2, w: 0.4, h: 0.3 },
  progress_modal_ring_color: "#22C55E",
  progress_modal_badge_color: "#16A34A",
  progress_modal_badge_text_color: "#FFFFFF",
  progress_modal_badge_bg_color: "#166534",
};

/**
 * createAdminClient のモック。
 * - rpc(): 進捗行を返す
 * - from("preset_categories").select().in(): progress_modal 列付き行を返す
 */
function buildAdminClient() {
  const rpc = jest.fn().mockResolvedValue({ data: [PROGRESS_ROW], error: null });
  const from = jest.fn((table: string) => {
    if (table === "preset_categories") {
      return {
        select: jest.fn(() => ({
          in: jest
            .fn()
            .mockResolvedValue({ data: [PRESET_CATEGORY_ROW], error: null }),
        })),
      };
    }
    // collection_completions(attachCompletionIds): 未完了なので呼ばれない想定
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };
  });
  return { rpc, from };
}

beforeEach(() => {
  jest.clearAllMocks();
  getRepresentativeImagesForCategoryMock.mockResolvedValue([]);
});

describe("getCollectionProgressForUser: progress-modal フィールド結合", () => {
  test("preset_categories の progress_modal_* を CollectionProgress に結合する", async () => {
    createAdminClientMock.mockImplementation(() => buildAdminClient());

    const result = await getCollectionProgressForUser("user-1", false);

    expect(result).toHaveLength(1);
    const p = result[0]!;
    // frame は buildPublicGeneratedImageUrl で組み立てた公開URL
    expect(p.progressModalFrameUrl).toBe(
      "https://cdn.example.com/public/frames/frame-1.webp",
    );
    expect(p.progressModalFrameWidth).toBe(1086);
    expect(p.progressModalFrameHeight).toBe(1448);
    expect(p.progressModalSlots).toEqual([
      { x: 0.1, y: 0.7, w: 0.13, h: 0.13 },
      { x: 0.3, y: 0.7, w: 0.13, h: 0.13 },
    ]);
    expect(p.progressModalButton).toEqual({
      x: 0.1,
      y: 0.85,
      w: 0.8,
      h: 0.09,
    });
    expect(p.progressModalCenter).toEqual({
      x: 0.3,
      y: 0.2,
      w: 0.4,
      h: 0.3,
    });
    // 色 4 種が結合される
    expect(p.progressModalRingColor).toBe("#22C55E");
    expect(p.progressModalBadgeColor).toBe("#16A34A");
    expect(p.progressModalBadgeTextColor).toBe("#FFFFFF");
    expect(p.progressModalBadgeBgColor).toBe("#166534");
    // キャラ画像も公開URLに組み立て
    expect(p.characterImageUrl).toBe(
      "https://cdn.example.com/public/characters/char-1.png",
    );
  });

  test("色列が null なら null として結合する", async () => {
    createAdminClientMock.mockImplementation(() => {
      const client = buildAdminClient();
      client.from = jest.fn((table: string) => {
        if (table === "preset_categories") {
          return {
            select: jest.fn(() => ({
              in: jest.fn().mockResolvedValue({
                data: [
                  {
                    ...PRESET_CATEGORY_ROW,
                    progress_modal_ring_color: null,
                    progress_modal_badge_color: null,
                    progress_modal_badge_text_color: null,
                    progress_modal_badge_bg_color: null,
                  },
                ],
                error: null,
              }),
            })),
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      });
      return client;
    });

    const result = await getCollectionProgressForUser("user-1", false);
    const p = result[0]!;
    expect(p.progressModalRingColor).toBeNull();
    expect(p.progressModalBadgeColor).toBeNull();
    expect(p.progressModalBadgeTextColor).toBeNull();
    expect(p.progressModalBadgeBgColor).toBeNull();
    // frame など他フィールドは引き続き結合される
    expect(p.progressModalFrameUrl).toBe(
      "https://cdn.example.com/public/frames/frame-1.webp",
    );
  });
});

describe("getCollectionProgressForUser: 解放ゲート(unlock_prerequisite_key)適用", () => {
  const GOD = {
    category_id: "god-id",
    category_key: "god",
    display_name_ja: "神コレ",
    display_name_en: "God",
    completion_threshold: 6,
    unique_outfit_count: 6,
    is_completed: false,
    mount_status: null,
    mount_image_path: null,
    completed_at: null,
  };
  const PETIT = {
    category_id: "petit-id",
    category_key: "petit",
    display_name_ja: "ぷち神",
    display_name_en: "Petit",
    completion_threshold: 6,
    unique_outfit_count: 2,
    is_completed: false,
    mount_status: null,
    mount_image_path: null,
    completed_at: null,
  };

  /**
   * RPC は [神コレ, ぷち神] を返す(admin プレビュー想定)。
   * preset_categories は key と unlock_prerequisite_key を返す。
   * 神コレの完走状態(godCompleted)で台紙作成済みかを切り替える。
   */
  function buildGateClient(godCompleted: boolean) {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ ...GOD, is_completed: godCompleted }, PETIT],
      error: null,
    });
    const categoryRows = [
      { id: "god-id", key: "god", unlock_prerequisite_key: null },
      { id: "petit-id", key: "petit", unlock_prerequisite_key: "god" },
    ];
    const from = jest.fn((table: string) => {
      if (table === "preset_categories") {
        return {
          select: jest.fn(() => ({
            in: jest
              .fn()
              .mockResolvedValue({ data: categoryRows, error: null }),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      };
    });
    return { rpc, from };
  }

  test("前提(神コレ)が未完走ならゲート付きカテゴリ(ぷち神)を除外する", async () => {
    createAdminClientMock.mockImplementation(() => buildGateClient(false));

    const result = await getCollectionProgressForUser("user-1", true);

    const keys = result.map((r) => r.categoryKey);
    expect(keys).toContain("god");
    expect(keys).not.toContain("petit");
  });

  test("前提(神コレ)が完走済みならゲート付きカテゴリ(ぷち神)を表示する", async () => {
    createAdminClientMock.mockImplementation(() => buildGateClient(true));

    const result = await getCollectionProgressForUser("user-1", true);

    const keys = result.map((r) => r.categoryKey);
    expect(keys).toContain("god");
    expect(keys).toContain("petit");
  });

  test("ゲートなしカテゴリ(神コレ)は前提に関係なく常に表示する", async () => {
    createAdminClientMock.mockImplementation(() => buildGateClient(false));

    const result = await getCollectionProgressForUser("user-1", true);

    expect(result.some((r) => r.categoryKey === "god")).toBe(true);
  });

  test("ゲート情報の取得に失敗したら回帰回避で全件返す(over-hiding しない)", async () => {
    createAdminClientMock.mockImplementation(() => {
      const client = buildGateClient(false);
      client.from = jest.fn((table: string) => {
        if (table === "preset_categories") {
          return {
            select: jest.fn(() => ({
              in: jest
                .fn()
                .mockResolvedValue({ data: null, error: { message: "boom" } }),
            })),
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      });
      return client;
    });
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await getCollectionProgressForUser("user-1", true);

    // ゲート判定不能 → 全件(神コレ + ぷち神)返す
    const keys = result.map((r) => r.categoryKey);
    expect(keys).toContain("god");
    expect(keys).toContain("petit");
    consoleError.mockRestore();
  });
});

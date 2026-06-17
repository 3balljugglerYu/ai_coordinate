/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));
jest.mock("@/features/collections/lib/collection-progress-repository", () => ({
  getCollectionProgress: jest.fn(),
}));
jest.mock("@/features/style-presets/lib/style-preset-repository", () => ({
  listPublishedStylePresets: jest.fn(),
}));

import {
  resolveCollectionUnlockContext,
  authorizeStylePresetUnlock,
} from "@/features/collections/lib/collection-unlock-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCollectionProgress } from "@/features/collections/lib/collection-progress-repository";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const mockCreateAdminClient =
  createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockGetCollectionProgress =
  getCollectionProgress as jest.MockedFunction<typeof getCollectionProgress>;
const mockListPublished =
  listPublishedStylePresets as jest.MockedFunction<
    typeof listPublishedStylePresets
  >;

const PREREQ = "collectible_wafer_sticker_god_6p";
const PETIT = "collectible_wafer_sticker_god_petit_6p";

type Client = Parameters<typeof resolveCollectionUnlockContext>[2];
const dummyClient = {} as Client;

function categoryRef(
  key: string,
  unlockPrerequisiteKey: string | null = null,
  progressiveBatchSize: number | null = null,
): StylePresetPublicSummary["category"] {
  return {
    id: key,
    key,
    displayNameJa: key,
    displayNameEn: key,
    badgeColor: "#000000",
    badgeTextColor: "#ffffff",
    skipBasePrefix: false,
    outputAspectRatioMode: "square",
    userGuidanceJa: null,
    userGuidanceEn: null,
    showSourceImageTypeControl: true,
    showBackgroundChangeControl: true,
    showGenerationModelControl: true,
    showUserPromptInput: false,
    userPromptLabel: null,
    userPromptPlaceholder: null,
    userPromptMaxLength: null,
    visibility: "public",
    isActive: true,
    unlockPrerequisiteKey,
    progressiveBatchSize,
    unlockAnnouncementHeroPath: null,
    unlockAnnouncementInitialBody: null,
    unlockAnnouncementDripBody: null,
    unlockAnnouncementAccentColor: null,
    unlockAnnouncementAccentHoverColor: null,
    unlockAnnouncementTitleColor: null,
    unlockAnnouncementSoftColor: null,
  };
}

function presetSummary(
  id: string,
  category: StylePresetPublicSummary["category"],
): StylePresetPublicSummary {
  return {
    id,
    title: id,
    thumbnailImageUrl: "",
    thumbnailWidth: 1,
    thumbnailHeight: 1,
    hasBackgroundPrompt: false,
    category,
    imageInputMode: "single",
    dualReferenceSource: "admin",
  };
}

function setProgress(rows: Array<{ categoryKey: string; isCompleted: boolean }>) {
  mockGetCollectionProgress.mockResolvedValue(
    rows as unknown as Awaited<ReturnType<typeof getCollectionProgress>>,
  );
}

function setDistinctRpc(
  rows: Array<{ category_key: string; unique_count: number }> | null,
  error: unknown = null,
) {
  const rpc = jest.fn().mockResolvedValue({ data: rows, error });
  mockCreateAdminClient.mockReturnValue({
    rpc,
  } as unknown as ReturnType<typeof createAdminClient>);
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("resolveCollectionUnlockContext", () => {
  it("ゲート対象カテゴリが無ければ DB を一切叩かず空コンテキストを返す", async () => {
    const presets = [presetSummary("a", categoryRef("coordinate"))];

    const ctx = await resolveCollectionUnlockContext(presets, "user-1", dummyClient);

    expect(ctx.prerequisiteCompletedKeys.size).toBe(0);
    expect(ctx.distinctGeneratedByCategoryKey.size).toBe(0);
    expect(mockGetCollectionProgress).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("前提完走済み + RPC の distinct 件数を返す", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: true }]);
    setDistinctRpc([{ category_key: PETIT, unique_count: 2 }]);
    const presets = [presetSummary("p1", categoryRef(PETIT, PREREQ, 2))];

    const ctx = await resolveCollectionUnlockContext(presets, "user-1", dummyClient);

    expect(ctx.prerequisiteCompletedKeys.has(PREREQ)).toBe(true);
    expect(ctx.distinctGeneratedByCategoryKey.get(PETIT)).toBe(2);
  });

  it("前提が未完走なら完走集合に含めない", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: false }]);
    setDistinctRpc([]);
    const presets = [presetSummary("p1", categoryRef(PETIT, PREREQ, 2))];

    const ctx = await resolveCollectionUnlockContext(presets, "user-1", dummyClient);

    expect(ctx.prerequisiteCompletedKeys.has(PREREQ)).toBe(false);
    expect(ctx.distinctGeneratedByCategoryKey.get(PETIT)).toBe(0);
  });

  it("RPC エラー時は distinct を 0 のまま返す(安全側)", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: true }]);
    setDistinctRpc(null, { message: "boom" });
    const presets = [presetSummary("p1", categoryRef(PETIT, PREREQ, 2))];

    const ctx = await resolveCollectionUnlockContext(presets, "user-1", dummyClient);

    expect(ctx.distinctGeneratedByCategoryKey.get(PETIT)).toBe(0);
  });

  it("get_collection_progress が throw しても未完走として安全側に倒す", async () => {
    mockGetCollectionProgress.mockRejectedValue(new Error("rpc down"));
    setDistinctRpc([{ category_key: PETIT, unique_count: 5 }]);
    const presets = [presetSummary("p1", categoryRef(PETIT, PREREQ, 2))];

    const ctx = await resolveCollectionUnlockContext(presets, "user-1", dummyClient);

    expect(ctx.prerequisiteCompletedKeys.size).toBe(0);
  });
});

describe("authorizeStylePresetUnlock", () => {
  it("ゲートなしカテゴリは常に許可", async () => {
    const result = await authorizeStylePresetUnlock(
      categoryRef("coordinate"),
      "p1",
      "user-1",
      dummyClient,
    );
    expect(result).toEqual({ allowed: true });
    expect(mockGetCollectionProgress).not.toHaveBeenCalled();
  });

  it("前提未完走は prerequisite_incomplete で拒否", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: false }]);
    const result = await authorizeStylePresetUnlock(
      categoryRef(PETIT, PREREQ, 2),
      "p1",
      "user-1",
      dummyClient,
    );
    expect(result).toEqual({ allowed: false, reason: "prerequisite_incomplete" });
  });

  // 解放ゲート付きカテゴリは sort_order の降順で解放する(末尾=sort最大 を先に解放)。
  it("解放範囲内のプリセットは許可(distinct0/batch2 → 降順で末尾2つ)", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: true }]);
    setDistinctRpc([{ category_key: PETIT, unique_count: 0 }]);
    const cat = categoryRef(PETIT, PREREQ, 2);
    // 一覧は sort_order 昇順(p0..p5)。distinct0/batch2 → 解放数2。
    mockListPublished.mockResolvedValue(
      ["p0", "p1", "p2", "p3", "p4", "p5"].map((id) => presetSummary(id, cat)),
    );

    // 降順 index: p5→0, p4→1 が解放。
    await expect(
      authorizeStylePresetUnlock(cat, "p5", "user-1", dummyClient),
    ).resolves.toEqual({ allowed: true });
    await expect(
      authorizeStylePresetUnlock(cat, "p4", "user-1", dummyClient),
    ).resolves.toEqual({ allowed: true });
  });

  it("未解放(降順 index>=unlockedCount)は preset_locked で拒否", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: true }]);
    setDistinctRpc([{ category_key: PETIT, unique_count: 0 }]);
    const cat = categoryRef(PETIT, PREREQ, 2);
    mockListPublished.mockResolvedValue(
      ["p0", "p1", "p2", "p3", "p4", "p5"].map((id) => presetSummary(id, cat)),
    );

    // distinct0/batch2 → unlocked 2。p0 は昇順 index0 だが降順では index5 = 未解放。
    const result = await authorizeStylePresetUnlock(cat, "p0", "user-1", dummyClient);
    expect(result).toEqual({ allowed: false, reason: "preset_locked" });
  });

  it("一覧に存在しないプリセットは preset_locked で拒否", async () => {
    setProgress([{ categoryKey: PREREQ, isCompleted: true }]);
    setDistinctRpc([{ category_key: PETIT, unique_count: 6 }]);
    const cat = categoryRef(PETIT, PREREQ, 2);
    mockListPublished.mockResolvedValue([presetSummary("p0", cat)]);

    const result = await authorizeStylePresetUnlock(cat, "unknown", "user-1", dummyClient);
    expect(result).toEqual({ allowed: false, reason: "preset_locked" });
  });
});

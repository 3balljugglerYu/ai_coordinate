/** @jest-environment node */

/**
 * スタイルの解放状態の解決のテスト。
 *
 * ここが誤ると (a) 未開放のスタイルへ生成画面まで飛ばして黙って差し替える、
 * (b) 未公開スタイルの存在を「まだ開放されていません」で教えてしまう、
 * (c) 使えるスタイルを止めてしまう、のいずれかが起きる。
 */

jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePresets: jest.fn(),
}));

jest.mock("@/features/collections/lib/collection-unlock-server", () => ({
  resolveCollectionUnlockContext: jest.fn(),
}));

import { resolvePresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { resolveCollectionUnlockContext } from "@/features/collections/lib/collection-unlock-server";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockGetPresets = getPublishedStylePresets as jest.MockedFunction<
  typeof getPublishedStylePresets
>;
const mockResolveContext = resolveCollectionUnlockContext as jest.MockedFunction<
  typeof resolveCollectionUnlockContext
>;

const USER_ID = "user-1";
const supabase = {} as SupabaseClient;

/** カテゴリを共有する連番プリセット（sort_order 昇順で並べる）。 */
function buildPresets(
  count: number,
  category: {
    key?: string;
    sequentialUnlock?: boolean;
    unlockPrerequisiteKey?: string | null;
    progressiveBatchSize?: number | null;
  } = {}
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `preset-${index}`,
    category: {
      key: category.key ?? "collection",
      sequentialUnlock: category.sequentialUnlock ?? false,
      unlockPrerequisiteKey: category.unlockPrerequisiteKey ?? null,
      progressiveBatchSize: category.progressiveBatchSize ?? 1,
      visibility: "public",
    },
  })) as unknown as Awaited<ReturnType<typeof getPublishedStylePresets>>;
}

function context(generated: number, prerequisites: string[] = []) {
  return {
    prerequisiteCompletedKeys: new Set(prerequisites),
    distinctGeneratedByCategoryKey: new Map([["collection", generated]]),
  };
}

describe("resolvePresetUnlockState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ゲートの無いカテゴリは常に開放（問い合わせもしない）", async () => {
    mockGetPresets.mockResolvedValue(
      buildPresets(3, { sequentialUnlock: false, unlockPrerequisiteKey: null })
    );

    const state = await resolvePresetUnlockState("preset-2", USER_ID, supabase);

    expect(state).toEqual({ status: "unlocked" });
    // 大多数のスタイルはここで終わる。解放文脈の解決は走らせない
    expect(mockResolveContext).not.toHaveBeenCalled();
  });

  test("段階解放で開放済みなら unlocked", async () => {
    mockGetPresets.mockResolvedValue(buildPresets(5, { sequentialUnlock: true }));
    mockResolveContext.mockResolvedValue(context(2));

    // batch=1・2件生成済み → 1*(1+2)=3 で index 0〜2 が開放
    await expect(
      resolvePresetUnlockState("preset-2", USER_ID, supabase)
    ).resolves.toEqual({ status: "unlocked" });
  });

  test("段階解放で未開放なら理由つきで locked", async () => {
    mockGetPresets.mockResolvedValue(buildPresets(5, { sequentialUnlock: true }));
    mockResolveContext.mockResolvedValue(context(2));

    // index 3 は「次の1つ」= シルエット、index 4 は非表示。どちらも未開放
    await expect(
      resolvePresetUnlockState("preset-3", USER_ID, supabase)
    ).resolves.toEqual({ status: "locked", reason: "sequential" });
    await expect(
      resolvePresetUnlockState("preset-4", USER_ID, supabase)
    ).resolves.toEqual({ status: "locked", reason: "sequential" });
  });

  test("前提カテゴリ未完走は prerequisite として locked", async () => {
    mockGetPresets.mockResolvedValue(
      buildPresets(3, { unlockPrerequisiteKey: "previous" })
    );
    mockResolveContext.mockResolvedValue(context(0, []));

    await expect(
      resolvePresetUnlockState("preset-0", USER_ID, supabase)
    ).resolves.toEqual({ status: "locked", reason: "prerequisite" });
  });

  test("未公開・存在しない ID は unknown（存在を教えない）", async () => {
    mockGetPresets.mockResolvedValue(buildPresets(3, { sequentialUnlock: true }));

    await expect(
      resolvePresetUnlockState("preset-999", USER_ID, supabase)
    ).resolves.toEqual({ status: "unknown" });
    expect(mockResolveContext).not.toHaveBeenCalled();
  });

  test("未ログインは判定しない（unknown）", async () => {
    mockGetPresets.mockResolvedValue(buildPresets(3, { sequentialUnlock: true }));

    await expect(
      resolvePresetUnlockState("preset-0", null, supabase)
    ).resolves.toEqual({ status: "unknown" });
    expect(mockResolveContext).not.toHaveBeenCalled();
  });

  test("ID が空なら unknown", async () => {
    await expect(
      resolvePresetUnlockState(null, USER_ID, supabase)
    ).resolves.toEqual({ status: "unknown" });
    expect(mockGetPresets).not.toHaveBeenCalled();
  });
});

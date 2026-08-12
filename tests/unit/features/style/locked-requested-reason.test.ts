/**
 * `/style?style=` の保険モーダルを出すかどうかの判定のテスト。
 *
 * 実機で「未ログインだと、ログインすれば使えるスタイルにも
 * 『まだ開放されていません』と出る」不具合があった。解放状態は
 * 「そのユーザーが何件生成したか」で決まるため、進捗を持たないゲストには
 * 判定のしようがない（空の解放文脈でゲーティングすると全部が未開放に見える）。
 *
 * StylePageBody はサーバーコンポーネントで直接テストしづらいため、
 * 判定式そのものをここで固定する。式を変えるときは両方直すこと。
 */

import { applyCollectionUnlockGating } from "@/features/collections/lib/collection-unlock-gating";
import type { CollectionUnlockContext } from "@/features/collections/lib/collection-unlock-gating";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/get-public-style-presets";

const EMPTY_CONTEXT: CollectionUnlockContext = {
  prerequisiteCompletedKeys: new Set(),
  distinctGeneratedByCategoryKey: new Map(),
};

function buildPresets(count: number, gating: {
  sequentialUnlock?: boolean;
  unlockPrerequisiteKey?: string | null;
  progressiveBatchSize?: number | null;
}): StylePresetPublicSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `preset-${index}`,
    category: {
      key: "collection",
      sequentialUnlock: gating.sequentialUnlock ?? false,
      unlockPrerequisiteKey: gating.unlockPrerequisiteKey ?? null,
      progressiveBatchSize: gating.progressiveBatchSize ?? 1,
    },
  })) as unknown as StylePresetPublicSummary[];
}

/** StylePageBody の判定式（未ログインは null に倒す）。 */
function resolveLockedRequestedReason(
  isAuthenticated: boolean,
  requestedPresetId: string | null,
  cachedPresets: StylePresetPublicSummary[],
  context: CollectionUnlockContext
): "sequential" | "prerequisite" | null {
  const gated = applyCollectionUnlockGating(cachedPresets, context);
  const id = isAuthenticated ? requestedPresetId : null;
  const requested = id ? cachedPresets.find((p) => p.id === id) : undefined;
  const inGated = id ? gated.find((p) => p.id === id) : undefined;
  const prerequisiteKey = requested?.category.unlockPrerequisiteKey ?? null;
  return requested && (!inGated || inGated.locked === true)
    ? prerequisiteKey && !context.prerequisiteCompletedKeys.has(prerequisiteKey)
      ? "prerequisite"
      : "sequential"
    : null;
}

describe("`?style=` の未開放案内", () => {
  test("未ログインには出さない（ログインすれば使えるスタイルを止めない）", () => {
    const presets = buildPresets(5, { sequentialUnlock: true });

    // 空の解放文脈では index 1 以降が未開放に見えるが、ゲストには案内しない
    expect(
      resolveLockedRequestedReason(false, "preset-4", presets, EMPTY_CONTEXT)
    ).toBeNull();
  });

  test("ログイン済みで未開放なら案内する", () => {
    const presets = buildPresets(5, { sequentialUnlock: true });

    expect(
      resolveLockedRequestedReason(true, "preset-4", presets, EMPTY_CONTEXT)
    ).toBe("sequential");
  });

  test("ログイン済みで開放済みなら出さない", () => {
    const presets = buildPresets(5, { sequentialUnlock: true });

    expect(
      resolveLockedRequestedReason(true, "preset-0", presets, EMPTY_CONTEXT)
    ).toBeNull();
  });

  test("前提未完走は prerequisite、完走済みの段階解放は sequential", () => {
    const presets = buildPresets(4, {
      unlockPrerequisiteKey: "previous",
      progressiveBatchSize: 2,
    });

    expect(
      resolveLockedRequestedReason(true, "preset-0", presets, EMPTY_CONTEXT)
    ).toBe("prerequisite");

    // 完走済みの人へ「前の企画を完走してください」と言わない
    expect(
      resolveLockedRequestedReason(true, "preset-0", presets, {
        prerequisiteCompletedKeys: new Set(["previous"]),
        distinctGeneratedByCategoryKey: new Map(),
      })
    ).toBe("sequential");
  });

  test("公開一覧に無い ID は出さない（存在を教えない）", () => {
    const presets = buildPresets(3, { sequentialUnlock: true });

    expect(
      resolveLockedRequestedReason(true, "preset-999", presets, EMPTY_CONTEXT)
    ).toBeNull();
  });

  test("`?style=` が無ければ出さない", () => {
    const presets = buildPresets(3, { sequentialUnlock: true });

    expect(
      resolveLockedRequestedReason(true, null, presets, EMPTY_CONTEXT)
    ).toBeNull();
  });
});

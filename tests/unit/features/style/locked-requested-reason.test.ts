/**
 * `/style?style=` の案内を出すかどうかの判定のテスト。
 *
 * 実機で「未ログインだと『まだ開放されていません』と出る」不具合があった。
 * 解放状態は「そのユーザーが何件生成したか」で決まるため、進捗を持たない
 * ゲストには判定のしようがない。かといって黙って別のスタイルへ差し替えると、
 * 何が起きたか分からないまま離脱する。ゲストには「ログインすると使えます」を出す。
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

/** StylePageBody の判定式（未ログインは login_required に倒す）。 */
function resolveLockedRequestedReason(
  isAuthenticated: boolean,
  requestedPresetId: string | null,
  cachedPresets: StylePresetPublicSummary[],
  context: CollectionUnlockContext
): "sequential" | "prerequisite" | "login_required" | null {
  const gated = applyCollectionUnlockGating(cachedPresets, context);
  const requested = requestedPresetId
    ? cachedPresets.find((p) => p.id === requestedPresetId)
    : undefined;
  const inGated = requestedPresetId
    ? gated.find((p) => p.id === requestedPresetId)
    : undefined;
  const prerequisiteKey = requested?.category.unlockPrerequisiteKey ?? null;
  const notSelectable = !!requested && (!inGated || inGated.locked === true);
  return notSelectable
    ? !isAuthenticated
      ? "login_required"
      : prerequisiteKey && !context.prerequisiteCompletedKeys.has(prerequisiteKey)
        ? "prerequisite"
        : "sequential"
    : null;
}

describe("`?style=` の未開放案内", () => {
  test("未ログインには「ログインすると使えます」を出す", () => {
    // 「まだ開放されていません」は誤り(ゲストに解放状態は無い)。
    // かといって黙って差し替えると、何が起きたか分からないまま離脱する
    const presets = buildPresets(5, { sequentialUnlock: true });

    expect(
      resolveLockedRequestedReason(false, "preset-4", presets, EMPTY_CONTEXT)
    ).toBe("login_required");
  });

  test("未ログインでも選択できるスタイルには何も出さない", () => {
    const presets = buildPresets(5, { sequentialUnlock: true });

    expect(
      resolveLockedRequestedReason(false, "preset-0", presets, EMPTY_CONTEXT)
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

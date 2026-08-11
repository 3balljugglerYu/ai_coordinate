import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { applyCollectionUnlockGating } from "./collection-unlock-gating";
import { categoryNeedsUnlockContext } from "./collection-unlock";
import { resolveCollectionUnlockContext } from "./collection-unlock-server";

/**
 * 段階解放スタイルの「この閲覧者にとって開放済みか」。
 *
 * - `unlocked`: 使える（ゲートの無いカテゴリを含む）
 * - `locked`: 公開されているが、この閲覧者にはまだ開放されていない
 * - `unknown`: 判定しない／できない（未ログイン、存在しない、未公開、admin_only）
 *
 * `unknown` を `locked` と区別するのは、**存在しないものの存在を教えないため**。
 * 未公開のIDを指定されたときに「まだ開放されていません」と返すと、そこに何かある
 * ことが分かってしまう（ADR-005 と同じ考え方）。
 */
export type PresetUnlockState =
  | { status: "unlocked" }
  | { status: "locked"; reason: "sequential" | "prerequisite" }
  | { status: "unknown" };

const UNKNOWN: PresetUnlockState = { status: "unknown" };

/**
 * 1件のプリセットについて解放状態を解決する。
 *
 * 判定は `/style` の一覧と**同じ関数**（`resolveCollectionUnlockContext` +
 * `applyCollectionUnlockGating`）を通す。ここで条件を書き写すと、
 * 「一覧ではロックなのに個別では開放」のような食い違いが生まれる。
 *
 * @param presetId 判定したいプリセット ID
 * @param userId 閲覧者。null（未ログイン）は判定しない
 * @param authedClient cookie 認証済みサーバークライアント
 */
export async function resolvePresetUnlockState(
  presetId: string | null | undefined,
  userId: string | null,
  authedClient: SupabaseClient,
  options: { includeAdminOnly?: boolean } = {}
): Promise<PresetUnlockState> {
  if (!presetId) {
    return UNKNOWN;
  }

  const presets = await getPublishedStylePresets({
    includeAdminOnly: options.includeAdminOnly,
  });
  const target = presets.find((preset) => preset.id === presetId);
  if (!target) {
    // 未公開・admin_only・存在しない。何も答えない
    return UNKNOWN;
  }

  // ゲートの無いカテゴリは常に使える（大多数のスタイルはここで終わる）
  if (!categoryNeedsUnlockContext(target.category)) {
    return { status: "unlocked" };
  }

  if (!userId) {
    // 未ログインに解放状態は無い。ログインを促すのは別の仕組みの役目
    return UNKNOWN;
  }

  const context = await resolveCollectionUnlockContext(
    presets,
    userId,
    authedClient,
    { includeAdminOnly: options.includeAdminOnly }
  );
  const gated = applyCollectionUnlockGating(presets, context);
  const match = gated.find((preset) => preset.id === presetId);

  if (match && match.locked !== true) {
    return { status: "unlocked" };
  }

  /*
    まだ開放されていない。理由は**文脈から**決める。

    カテゴリ設定(`sequentialUnlock`)だけで決めると、前提カテゴリ付きの企画で
    「前提は完走済みだが、この1件はまだ段階解放の範囲外」というケースまで
    `prerequisite` になり、既に完走した人へ「前の企画を完走すると開放されます」と
    誤って案内してしまう。

    - 前提カテゴリがあり、まだ完走していない → prerequisite（前の企画を完走する）
    - それ以外（前提完走済み・前提なし）      → sequential（生成すると次が開く）

    後者は sequential でも前提付き drip でも「生成すると開放される」で同じなので、
    文言を分ける必要はない。
  */
  const prerequisiteKey = target.category.unlockPrerequisiteKey;
  const prerequisitePending =
    !!prerequisiteKey && !context.prerequisiteCompletedKeys.has(prerequisiteKey);

  return {
    status: "locked",
    reason: prerequisitePending ? "prerequisite" : "sequential",
  };
}

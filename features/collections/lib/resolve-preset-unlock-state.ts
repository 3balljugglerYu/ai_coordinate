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
    まだ開放されていない。理由で案内の文言を変える。
    - sequential: 同じ企画を生成すると次が開く
    - prerequisite: 前の企画を完走すると開く
  */
  return {
    status: "locked",
    reason: target.category.sequentialUnlock === true ? "sequential" : "prerequisite",
  };
}

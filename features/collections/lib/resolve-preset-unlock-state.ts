import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPublishedStylePreset,
  getPublishedStylePresets,
} from "@/features/style-presets/lib/get-public-style-presets";
import { isCollectionDisplayPeriodEnded } from "./collection-display-period";
import { applyCollectionUnlockGating } from "./collection-unlock-gating";
import { categoryNeedsUnlockContext } from "./collection-unlock";
import { resolveCollectionUnlockContext } from "./collection-unlock-server";

/**
 * 段階解放スタイルの「この閲覧者にとって開放済みか」。
 *
 * - `unlocked`: 使える（ゲートの無いカテゴリを含む）
 * - `locked`: 公開されているが、この閲覧者にはまだ開放されていない
 * - `login_required`: 段階解放のスタイルを未ログインで指している。
 *   解放状態は「そのユーザーが何件生成したか」で決まるため、進捗を持たない
 *   ゲストには判定のしようがない。黙って別のスタイルへ差し替えると
 *   「押し間違えた？」のまま離脱するので、**ログインすれば使えること**を伝える
 * - `ended`: 公開されていた企画の**会期が終わった**。もう生成できない
 * - `unknown`: 判定しない／できない（存在しない、未公開、admin_only、開始前）
 *
 * `unknown` を `locked` と区別するのは、**存在しないものの存在を教えないため**。
 * 未公開のIDを指定されたときに「まだ開放されていません」と返すと、そこに何かある
 * ことが分かってしまう（ADR-005 と同じ考え方）。
 *
 * `ended` を `unknown` から切り出すのは、**終了した企画は秘匿対象ではない**ため。
 * 投稿カードにプリセット名もサムネイルも出ている状態で黙ると、閲覧者には
 * 「押しても反応しない」としか映らない。開始前は逆に伏せる（まだ言えない）。
 */
export type PresetUnlockState =
  | { status: "unlocked" }
  | { status: "locked"; reason: "sequential" | "prerequisite" }
  | { status: "login_required" }
  | { status: "ended" }
  | { status: "unknown" };

const UNKNOWN: PresetUnlockState = { status: "unknown" };
const ENDED: PresetUnlockState = { status: "ended" };

/**
 * 公開されていた企画で、会期だけが終わったプリセットか。
 *
 * `visibility === "public"` に限る。admin_only を「終了」と答えると、
 * 未公開カテゴリの存在が漏れる。開始前も false（まだ言えない）。
 */
async function isEndedPublicPreset(presetId: string): Promise<boolean> {
  const preset = await getPublishedStylePreset(presetId, {
    includeAdminOnly: true,
  });
  if (!preset || preset.category.visibility !== "public") {
    return false;
  }
  return isCollectionDisplayPeriodEnded({
    collectionDisplayStartsAt: preset.category.collectionDisplayStartsAt,
    collectionDisplayEndsAt: preset.category.collectionDisplayEndsAt,
  });
}

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
    /*
      一覧から外れる理由は「未公開・admin_only・存在しない」だけでなく
      「会期が終わった」もある。前者は黙るが、後者は伝える必要があるので
      1件だけ引き直して切り分ける（外れるのは稀なので追加の往復も稀）。
    */
    return (await isEndedPublicPreset(presetId)) ? ENDED : UNKNOWN;
  }

  // ゲートの無いカテゴリは常に使える（大多数のスタイルはここで終わる）
  if (!categoryNeedsUnlockContext(target.category)) {
    return { status: "unlocked" };
  }

  if (!userId) {
    /*
      未ログインに解放状態は無い（進捗が無いので判定できない）。

      ただし黙って別のスタイルへ差し替えると、ゲストは何が起きたか分からないまま
      離脱する。ここは「ログインすれば使える」と伝える場面なので、
      unknown ではなく login_required を返す。
    */
    return { status: "login_required" };
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

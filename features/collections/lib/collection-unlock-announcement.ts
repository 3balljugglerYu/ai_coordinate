import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { computeUnlockedCount } from "./collection-unlock";
import type { CollectionUnlockContext } from "./collection-unlock-gating";

/**
 * 解放ゲート付きカテゴリ(例: ぷち神)の「解放のお知らせ」を出すための、ユーザー別サマリ。
 *
 * クライアント側(PetitUnlockAnnouncer)は localStorage の「前回見た解放数」と
 * `unlockedCount` を比較して、初回バナー(A)/段階解放モーダル(B)/出さない を決める。
 *
 * - `unlockedPresets` は「解放順(= sort_order の多い順 / 末尾から)」に並んだ、現在解放済みの
 *   プリセット。段階解放モーダルで「新たに解放された分」を `slice(seen, unlockedCount)` で
 *   取り出してサムネ表示するために、解放順で渡す(applyCollectionUnlockGating の解放順と一致)。
 */
export interface CollectionUnlockAnnouncement {
  categoryKey: string;
  categoryDisplayName: string;
  unlockedCount: number;
  totalCount: number;
  unlockedPresets: {
    id: string;
    title: string;
    thumbnailUrl: string;
  }[];
  /** 前提カテゴリ(例: 神コレ)の key。コンプリート演出の ack 比較に使う。 */
  prerequisiteKey: string;
  /**
   * 前提カテゴリの「ユニーク生成数」(コンプリート演出が ack する値)。
   * クライアントは collection-ack がこの値以上(=コンプリート演出を確認済み)のときだけ
   * お知らせを出し、演出と重ならないようにする。0 なら比較を行わない(常に出す)。
   */
  prerequisiteAckCount: number;
  /**
   * 解放お知らせモーダルのカスタム表示設定(admin がカテゴリ単位で設定)。
   * いずれも null なら現行ハードコード(画像/文言/紫基調の配色)にフォールバックする。
   * heroImagePath は storage パス(public バケット)。URL 化はクライアントで行う。
   */
  heroImagePath: string | null;
  initialBody: string | null;
  dripBody: string | null;
  accentColor: string | null;
  accentHoverColor: string | null;
  titleColor: string | null;
  softColor: string | null;
}

/**
 * 公開一覧 + 解放コンテキストから、解放お知らせ用サマリを作る純粋関数。
 *
 * 対象は「解放ゲート付き(unlockPrerequisiteKey != null)かつ前提カテゴリ完走済み」かつ
 * 解放数が 1 以上のカテゴリのみ。前提未完走・ゲートなしカテゴリは対象外(空配列に寄与しない)。
 *
 * @param presets サーバーで取得したプリセット一覧(sort_order 昇順)。locked 付与前でよい。
 * @param context resolveCollectionUnlockContext の結果。
 */
export function buildCollectionUnlockAnnouncements(
  presets: readonly StylePresetPublicSummary[],
  context: CollectionUnlockContext,
): CollectionUnlockAnnouncement[] {
  // 解放ゲート付き かつ 前提完走済み のカテゴリだけを、出現順(sort_order 昇順)に集約する。
  // 注: sequential_unlock(前提なし・昇順)カテゴリは「解放お知らせ」未対応。意図的にここで
  //   スキップする(prerequisite が無いため下の continue で除外)。対応する場合は下の .reverse()
  //   と progressiveBatchSize 前提(降順)を sequential 用に見直すこと。
  const itemsByCategoryKey = new Map<string, StylePresetPublicSummary[]>();
  for (const preset of presets) {
    const prerequisite = preset.category.unlockPrerequisiteKey;
    if (!prerequisite) continue;
    if (!context.prerequisiteCompletedKeys.has(prerequisite)) continue;
    const items = itemsByCategoryKey.get(preset.category.key);
    if (items) items.push(preset);
    else itemsByCategoryKey.set(preset.category.key, [preset]);
  }

  const announcements: CollectionUnlockAnnouncement[] = [];
  for (const [categoryKey, items] of itemsByCategoryKey) {
    const total = items.length;
    const distinctGenerated =
      context.distinctGeneratedByCategoryKey.get(categoryKey) ?? 0;
    const batchSize = items[0].category.progressiveBatchSize;
    const unlockedCount = computeUnlockedCount(distinctGenerated, batchSize, total);
    if (unlockedCount <= 0) continue;

    // 解放順(末尾=sort_order 最大 から)。items は sort_order 昇順なので reverse。
    const unlockOrder = items.slice().reverse();
    const unlockedPresets = unlockOrder
      .slice(0, unlockedCount)
      .map((preset) => ({
        id: preset.id,
        title: preset.title,
        thumbnailUrl: preset.thumbnailImageUrl,
      }));

    const prerequisiteKey = items[0].category.unlockPrerequisiteKey ?? "";
    const prerequisiteAckCount =
      context.prerequisiteUniqueCountByKey?.get(prerequisiteKey) ?? 0;

    const category = items[0].category;
    announcements.push({
      categoryKey,
      categoryDisplayName: category.displayNameJa,
      unlockedCount,
      totalCount: total,
      unlockedPresets,
      prerequisiteKey,
      prerequisiteAckCount,
      heroImagePath: category.unlockAnnouncementHeroPath,
      initialBody: category.unlockAnnouncementInitialBody,
      dripBody: category.unlockAnnouncementDripBody,
      accentColor: category.unlockAnnouncementAccentColor,
      accentHoverColor: category.unlockAnnouncementAccentHoverColor,
      titleColor: category.unlockAnnouncementTitleColor,
      softColor: category.unlockAnnouncementSoftColor,
    });
  }

  return announcements;
}

/** 解放お知らせの表示モード。 */
export type UnlockAnnouncementMode = "none" | "initial" | "drip";

/**
 * localStorage の「前回見た解放数」(未記録なら null)と現在の解放数から、表示モードを決める。
 *
 * - 未記録 かつ 解放数 > 0 → "initial"(初回お知らせ = ぷち神が解放された)
 * - 記録あり かつ 解放数 > 記録値 → "drip"(新たに段階解放された)
 * - それ以外 → "none"(出さない)
 */
export function decideUnlockAnnouncement(
  seenUnlockedCount: number | null,
  currentUnlockedCount: number,
): UnlockAnnouncementMode {
  if (currentUnlockedCount <= 0) return "none";
  if (seenUnlockedCount === null) return "initial";
  if (currentUnlockedCount > seenUnlockedCount) return "drip";
  return "none";
}

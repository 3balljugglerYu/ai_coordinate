/**
 * コレクション進捗カードの表示期間判定。
 *
 * preset_categories.collection_display_starts_at / collection_display_ends_at
 * (NULL = 制限なし) に対する [starts, ends) 判定。期間はカード表示・進捗モーダル・
 * 台紙生成 API のガードに使うが、/style での生成可否や完了サムネ・シェアページには
 * 影響させない。期間外でも達成済み(completed)ユーザーの台紙更新は呼び出し側で許可する。
 */
export interface CollectionDisplayPeriod {
  collectionDisplayStartsAt: string | null;
  collectionDisplayEndsAt: string | null;
}

export function isCollectionDisplayPeriodActive(
  period: CollectionDisplayPeriod,
  now: Date = new Date(),
): boolean {
  const { collectionDisplayStartsAt: starts, collectionDisplayEndsAt: ends } =
    period;
  if (starts) {
    const startsAt = new Date(starts);
    if (!Number.isNaN(startsAt.getTime()) && now < startsAt) return false;
  }
  if (ends) {
    const endsAt = new Date(ends);
    if (!Number.isNaN(endsAt.getTime()) && now >= endsAt) return false;
  }
  return true;
}

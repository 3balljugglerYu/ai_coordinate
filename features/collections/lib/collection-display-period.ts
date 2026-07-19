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

/** isActiveEventCategory の入力: 表示期間 + コレクションシリーズ登録の有無。 */
export interface ActiveEventCategoryInput extends CollectionDisplayPeriod {
  isCollectionSeries: boolean;
}

/**
 * 「開催中の企画」カテゴリか。
 * コレクションシリーズ(コンプリート要素)が登録されており、かつ表示期間内。
 * ホームの企画棚(derive-event-shelves)と探索シートの「🎉イベント」チップ
 * (style-browse-filter)が同じ判定を共有し、両者の表示期間が常に一致するようにする。
 */
export function isActiveEventCategory(
  category: ActiveEventCategoryInput,
  now: Date,
): boolean {
  return (
    category.isCollectionSeries && isCollectionDisplayPeriodActive(category, now)
  );
}

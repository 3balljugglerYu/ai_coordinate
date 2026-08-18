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

/**
 * 開催期間が**終了した**か（開始前は false）。
 *
 * `isCollectionDisplayPeriodActive` が false になる理由は「開始前」と「終了後」の
 * 2つあり、閲覧者に伝えてよいのは**終了後だけ**。開始前は先行公開・準備中であり、
 * 「終了しました」と言えば嘘になるうえ、これから始まる企画の存在を漏らす。
 */
export function isCollectionDisplayPeriodEnded(
  period: CollectionDisplayPeriod,
  now: Date = new Date(),
): boolean {
  const ends = period.collectionDisplayEndsAt;
  if (!ends) return false;
  const endsAt = new Date(ends);
  if (Number.isNaN(endsAt.getTime())) return false;
  return now >= endsAt;
}

/**
 * 開催期間(開始または終了のいずれか)が設定されているか。
 * 期間が未設定のコレクションシリーズは「常設(コラボ企画)」として扱い、
 * イベント(期間限定の企画)とはみなさない。
 */
export function hasCollectionDisplayPeriod(
  period: CollectionDisplayPeriod,
): boolean {
  return (
    period.collectionDisplayStartsAt !== null ||
    period.collectionDisplayEndsAt !== null
  );
}

/** isActiveEventCategory の入力: 表示期間 + コレクションシリーズ登録の有無。 */
export interface ActiveEventCategoryInput extends CollectionDisplayPeriod {
  isCollectionSeries: boolean;
}

/**
 * 「開催中の企画」カテゴリか。
 * コレクションシリーズ(コンプリート要素)が登録されており、開催期間が
 * **設定されており**、かつ表示期間内であること。
 * 期間未設定(NULL/NULL)のシリーズは常設のコラボ企画でありイベントではない
 * (ホームの企画棚・🎉イベントチップに出さない。生成やコンプリート機能は
 *  isCollectionDisplayPeriodActive の「NULL=制限なし」判定によりそのまま使える)。
 * ホームの企画棚(derive-event-shelves)と探索シートの「🎉イベント」チップ
 * (style-browse-filter)が同じ判定を共有し、両者の表示期間が常に一致するようにする。
 */
export function isActiveEventCategory(
  category: ActiveEventCategoryInput,
  now: Date,
): boolean {
  return (
    category.isCollectionSeries &&
    hasCollectionDisplayPeriod(category) &&
    isCollectionDisplayPeriodActive(category, now)
  );
}

/**
 * コレクション「遊び方(ガイド)」ページの URL をカテゴリ key から解決する。
 *
 * 遊び方ページは各カテゴリごとに用意したコード上のルート(例: app/collections/italy)。
 * リンク先(=ルート)はページ実体と密結合のため、DB ではなくこのコードマップで一元管理する。
 * 新しいコラボを足すときは「ガイドページを作る + ここに1行足す」だけで出し分けできる。
 *
 * 未登録カテゴリは従来の神コレ(ウエハース)ガイドにフォールバックする。
 */
const COLLECTION_GUIDE_PATHS: Record<string, string> = {
  travel_to_italy: "/collections/italy",
  // ことわざ辞典は上巻/下巻とも同じ遊び方ページを指す。
  kotowaza_dictionary: "/collections/kotowaza",
  kotowaza_dictionary_2: "/collections/kotowaza",
};

/** 未登録カテゴリのフォールバック先(神コレの遊び方)。 */
export const DEFAULT_COLLECTION_GUIDE_PATH = "/collections/wafer";

/** カテゴリ key から遊び方ページの URL を返す。未登録は神コレのガイドにフォールバック。 */
export function collectionGuidePath(
  categoryKey: string | null | undefined,
): string {
  if (categoryKey && COLLECTION_GUIDE_PATHS[categoryKey]) {
    return COLLECTION_GUIDE_PATHS[categoryKey];
  }
  return DEFAULT_COLLECTION_GUIDE_PATH;
}

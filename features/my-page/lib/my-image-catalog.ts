/**
 * マイページの生成画像一覧を「どのカタログで作ったか」で絞り込むための値と条件。
 *
 * カタログ刷新(`useStylesCatalogRevamp()`。公開前は運営だけ)のときだけ、
 * 「すべて / 投稿済み / 未投稿」の下にタブとして出す。
 *
 * 分け方は「カタログから生成」のシート(#661)と同じにする。同じ名前が指す画像を
 * カタログ側とマイページでそろえるため。
 *
 * | 値 | タブ | 条件 |
 * |---|---|---|
 * | `all` | すべて | 条件なし |
 * | `my_catalog` | My Catalog | `generation_type = 'free'` かつ `source_post_id IS NULL`(自分のプロンプト = 自分の原本) |
 * | `persta_original` | Persta ORIGINAL | `generation_type = 'one_tap_style'` |
 * | `user_original` | User ORIGINAL | `generation_type = 'free'` かつ `source_post_id IS NOT NULL`(みんなのカタログを使ったもの) |
 *
 * Coordinate・Creator Style の画像は専用のタブを持たず、「すべて」にだけ出る。
 */
export const MY_IMAGE_CATALOGS = [
  "all",
  "my_catalog",
  "persta_original",
  "user_original",
] as const;

export type MyImageCatalog = (typeof MY_IMAGE_CATALOGS)[number];

/** クエリ文字列の値を読む。知らない値・未指定は `all`(API を 400 にしない)。 */
export function parseMyImageCatalog(
  value: string | null | undefined,
): MyImageCatalog {
  return (MY_IMAGE_CATALOGS as readonly string[]).includes(value ?? "")
    ? (value as MyImageCatalog)
    : "all";
}

/** Supabase のクエリビルダーのうち、ここで使うものだけ。 */
interface CatalogFilterableQuery<Q> {
  eq(column: string, value: unknown): Q;
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
}

/** `generated_images` のクエリに、カタログの条件を重ねる。 */
export function applyMyImageCatalogFilter<Q extends CatalogFilterableQuery<Q>>(
  query: Q,
  catalog: MyImageCatalog,
): Q {
  switch (catalog) {
    case "my_catalog":
      return query.eq("generation_type", "free").is("source_post_id", null);
    case "persta_original":
      return query.eq("generation_type", "one_tap_style");
    case "user_original":
      return query
        .eq("generation_type", "free")
        .not("source_post_id", "is", null);
    default:
      return query;
  }
}

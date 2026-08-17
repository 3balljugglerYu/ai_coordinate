/**
 * generated_images 1行が持つ Storage 実体のパスを集める。
 *
 * 1行に対して最大4ファイルが存在する:
 *   storage_path                  原本(png 等)          平均 約1.9MB
 *   storage_path_display          表示用 WebP           平均 約137kB
 *   storage_path_thumb            サムネ WebP           平均 約76kB
 *   pre_generation_storage_path   Before 画像(生成前)
 *
 * **削除経路が個別に列を並べていたため取りこぼしが起きていた**
 * (一括削除は display を、単体削除は display と thumb を消していなかった)。
 * 列が増えたときに1箇所直せば全経路に効くよう、SELECT する列名と
 * パスの取り出しをここに集約する。
 */

/** 削除前の SELECT にそのまま渡す列リスト。 */
export const GENERATED_IMAGE_STORAGE_PATH_COLUMNS =
  "storage_path, storage_path_display, storage_path_thumb, pre_generation_storage_path";

export interface GeneratedImageStoragePathRow {
  storage_path?: string | null;
  storage_path_display?: string | null;
  storage_path_thumb?: string | null;
  pre_generation_storage_path?: string | null;
}

/**
 * 行から Storage パスを重複なしで取り出す。
 *
 * ゲストのワードローブ引き継ぎ(save-wardrobe-image)は3列すべてに**同じパス**を
 * 入れるため、重複除去が必要(同じパスを複数回 remove しても実害はないが、
 * 「消したファイル数」を数える側が実態とずれる)。
 */
export function collectGeneratedImageStoragePaths(
  rows: readonly GeneratedImageStoragePathRow[],
): string[] {
  const paths = new Set<string>();
  for (const row of rows) {
    if (row.storage_path) paths.add(row.storage_path);
    if (row.storage_path_display) paths.add(row.storage_path_display);
    if (row.storage_path_thumb) paths.add(row.storage_path_thumb);
    if (row.pre_generation_storage_path) {
      paths.add(row.pre_generation_storage_path);
    }
  }
  return [...paths];
}

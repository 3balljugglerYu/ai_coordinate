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

/**
 * 行の情報から**決定的に導ける**派生パスを返す。
 *
 * なぜ必要か: 派生ファイル(WebP変換 / Before画像)は生成成功後に
 * fire-and-forget で「upload → 列を UPDATE」の順に作られる。
 * 削除が「行を SELECT した後・列が UPDATE される前」に走ると、
 * 削除側の列には派生パスが入っておらず、実体だけが残る。
 * 命名は元の storage_path と id から一意に決まるので、列に無くても消せる。
 *
 * 実在しないパスを remove しても Supabase Storage はエラーにしない
 * (存在しないキーは黙って無視される)ため、常に足して問題ない。
 *
 * 命名の正本:
 *   webp        uploadWebPVariants        `<storage_path から拡張子を除いた部分>_thumb.webp` / `_display.webp`
 *   before画像   uploadBeforeImageWebP     `{user_id}/pre-generation/{generated_image_id}_display.webp`
 */
export function deriveGeneratedImageStoragePaths(row: {
  id?: string | null;
  user_id?: string | null;
  storage_path?: string | null;
}): string[] {
  const paths: string[] = [];

  if (row.storage_path) {
    const withoutExtension = row.storage_path.replace(/\.[^.]+$/, "");
    paths.push(`${withoutExtension}_thumb.webp`);
    paths.push(`${withoutExtension}_display.webp`);
  }

  if (row.user_id && row.id) {
    paths.push(`${row.user_id}/pre-generation/${row.id}_display.webp`);
  }

  return paths;
}

/**
 * 削除時に remove すべきパスの最終形。
 * 列に入っている実測値と、決定的に導ける派生パスの和(重複なし)。
 */
export function resolveGeneratedImageDeletablePaths(
  rows: readonly (GeneratedImageStoragePathRow & {
    id?: string | null;
    user_id?: string | null;
  })[],
): string[] {
  const paths = new Set(collectGeneratedImageStoragePaths(rows));
  for (const row of rows) {
    for (const derived of deriveGeneratedImageStoragePaths(row)) {
      paths.add(derived);
    }
  }
  return [...paths];
}

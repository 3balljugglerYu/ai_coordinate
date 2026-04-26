/**
 * `generated_images` 行に対して width / height が欠けていれば
 * 画像ヘッダーを取得して算出し、必要に応じて DB へ書き戻す純関数ユーティリティ。
 *
 * 副作用（画像 fetch / DB UPDATE）は依存性注入で受け取り、ロジックを単体テスト可能にする。
 * server-api.ts の `getPost` から呼び出される。
 *
 * 動作:
 * - width / height のいずれかが NULL のとき、image_url / storage_path から
 *   表示用 URL を解決して `fetchDimensions` を 1 回だけ呼ぶ
 * - 計算結果のうち未保存フィールドのみをマージしてレスポンス値を返す
 * - useCache=true のときは DB UPDATE をスキップ（レスポンスにはセット）
 * - useCache=false のときは未保存フィールドのみ UPDATE
 * - 取得失敗 / URL 解決不可のときは元の値（null かもしれない）を保ったまま返す
 */

export interface ImageDimensionsState {
  width: number | null;
  height: number | null;
}

export interface ImageRowSubset {
  width?: number | null;
  height?: number | null;
  image_url?: string | null;
  storage_path?: string | null;
}

export interface EnsureImageDimensionsParams {
  data: ImageRowSubset;
  useCache: boolean;
  /** 画像ヘッダーから寸法を取得する。失敗時は null を返す。 */
  fetchDimensions: (
    imageUrl: string,
  ) => Promise<{ width: number; height: number } | null>;
  /**
   * 表示用画像 URL を解決する。`image_url` を優先し、無ければ `storage_path` から
   * 公開 URL を組み立てる。解決できなければ null。
   */
  resolveImageUrl: (data: ImageRowSubset) => string | null;
  /**
   * 行を UPDATE する。useCache=true のときは呼ばれない。
   * 失敗は呼び出し側でキャッチして無視されることを想定。
   */
  updateRow: (updates: Record<string, unknown>) => Promise<void>;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function ensureImageDimensions(
  params: EnsureImageDimensionsParams,
): Promise<ImageDimensionsState> {
  const { data, useCache, fetchDimensions, resolveImageUrl, updateRow } = params;

  let width: number | null = isPositiveInteger(data.width) ? data.width : null;
  let height: number | null = isPositiveInteger(data.height) ? data.height : null;

  const needsWidth = width === null;
  const needsHeight = height === null;

  if (!needsWidth && !needsHeight) {
    return { width, height };
  }

  const imageUrl = resolveImageUrl(data);
  if (!imageUrl) {
    return { width, height };
  }

  let dimensions: { width: number; height: number } | null = null;
  try {
    dimensions = await fetchDimensions(imageUrl);
  } catch (error) {
    console.warn("Failed to calculate image dimensions:", error);
    return { width, height };
  }

  if (!dimensions) {
    return { width, height };
  }

  if (needsWidth) width = dimensions.width;
  if (needsHeight) height = dimensions.height;

  if (!useCache) {
    const updates: Record<string, unknown> = {};
    if (needsWidth && width !== null) updates.width = width;
    if (needsHeight && height !== null) updates.height = height;

    if (Object.keys(updates).length > 0) {
      try {
        await updateRow(updates);
      } catch (updateError) {
        console.warn(
          "Failed to update generated_image dimensions:",
          updateError,
        );
      }
    }
  }

  return { width, height };
}

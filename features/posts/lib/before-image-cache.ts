import { getImageUrlFromStoragePath } from "./utils";

/**
 * Before 画像 URL の module-level キャッシュ。
 *
 * 拡大表示モーダル（ImageModal）と投稿モーダル（PostModal）の両者が共有することで、
 * 同一画像を再オープンしたり、ImageModal → 「投稿」→ PostModal の遷移時に
 * `/api/posts/[id]/before-source` への重複リクエストを抑制する。
 *
 * 値が `null` のときは「Before なし確定」を意味する（取得済みかつ存在しない）。
 *
 * SPA セッション内のみのキャッシュで、ページリロードでクリアされる。
 */
export const beforeImageUrlCache = new Map<string, string | null>();

export interface BeforeImageSource {
  id?: string;
  isPreview?: boolean;
  preGenerationStoragePath?: string | null;
  showBeforeImage?: boolean;
}

/**
 * Before 画像 URL を同期的に解決する。
 *
 * - DB レコード由来の `preGenerationStoragePath` があればそこから URL を生成
 * - そうでなければ module-level キャッシュを参照
 * - いずれも該当しない場合は `undefined`（= 呼び出し側で API fetch が必要）
 *
 * 戻り値:
 *   - `string`: 表示すべき Before URL
 *   - `null`: Before は存在しない（確定）
 *   - `undefined`: 同期判定不可、API へ fetch が必要
 */
export function resolveBeforeImageUrlSync(
  source: BeforeImageSource | undefined | null,
): string | null | undefined {
  if (!source?.id) return null;
  if (source.isPreview) return null;
  if (source.showBeforeImage === false) return null;
  if (source.preGenerationStoragePath) {
    const url = getImageUrlFromStoragePath(source.preGenerationStoragePath);
    if (url) return url;
  }
  if (beforeImageUrlCache.has(source.id)) {
    return beforeImageUrlCache.get(source.id) ?? null;
  }
  return undefined;
}

/**
 * API から取得した Before URL をキャッシュに保存する。
 * `null` も「取得済みで Before なし」として保存する。
 */
export function cacheBeforeImageUrl(
  imageId: string,
  url: string | null,
): void {
  beforeImageUrlCache.set(imageId, url);
}

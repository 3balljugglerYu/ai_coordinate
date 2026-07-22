/**
 * ホーム上部バナー画像の sizes 定義。
 * HomeBannerCard の <Image> と、page.tsx の preload(先行ダウンロード)で
 * 同じ値を使い、srcset の解決結果を一致させてキャッシュに確実にヒットさせる。
 */
export const HOME_BANNER_IMAGE_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw";

/** HomeBannerCard の <Image> と同じ intrinsic サイズ (aspect 3:1)。 */
export const HOME_BANNER_IMAGE_WIDTH = 1200;
export const HOME_BANNER_IMAGE_HEIGHT = 400;

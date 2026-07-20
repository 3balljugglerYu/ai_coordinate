/**
 * ポップアップバナー画像の sizes 定義。
 *
 * PopupBannerOverlay の <Image>(表示) / 先読みゲート、および home page の
 * サーバー側 preload(<link rel="preload">)で同じ値を使う。値がずれると
 * ブラウザが選ぶ srcset 候補が食い違い、同じ画像を2回ダウンロードしてしまう
 * ため、必ずこの定数を共有すること。
 */
export const POPUP_BANNER_IMAGE_SIZES = "(max-width: 768px) 80vw, 420px";

import { trackEvent } from "@/features/analytics/lib/track-event";

/**
 * ホームのバナーを押したことを GA4 に送る(2026-10-16)。ポップアップは DB に記録しているが、
 * バナーは記録が無く、企画ページへの入口としてどちらが効いたか比べられなかったため。
 *
 * - link_url は GA4 の拡張計測(外部リンクのクリック)と同じ名前にした。GA4 にもともとある「リンク URL」で
 *   バナーごとに分けられる見込み(分けられなければ、GA4 の管理画面でカスタムディメンションに登録する)
 * - 送るのは管理画面で決めた値(ID と行き先)だけ。ユーザー由来の値は送らない(track-event.ts の決まり)
 */
export function trackHomeBannerClick(bannerId: string, linkUrl: string): void {
  trackEvent("home_banner_click", { banner_id: bannerId, link_url: linkUrl });
}

import { trackEvent } from "@/features/analytics/lib/track-event";

/**
 * 企画ページの操作を GA4 に送る(2026-10-16 ユーザー「今後も同じような企画をする上で、
 * アナリティクスはちゃんと残るように」)。ページのどこで離れたかを、次の企画と比べられるようにする。
 *
 * - 操作はイベント名に入れる。GA4 の画面でカスタムディメンションを登録しなくても、数が見られるため
 * - どの企画かは、GA4 が自動で付けるページのパスで分ける(次の企画のページも同じ名前を使えばよい)
 * - パラメータは送らない(track-event.ts の決まり。ユーザー由来の値を混ぜない)
 */
export const CAMPAIGN_EVENTS = {
  /** 浮いたボタン「カタログをつくる」 */
  ctaCreate: "campaign_cta_create",
  /** 浮いたボタン「カタログから生成する」 */
  ctaCatalog: "campaign_cta_catalog",
  /** 参加方法のタブで、クリエイティブ部門を選んだ(最初に開いているときは送らない) */
  tabCreative: "campaign_tab_creative",
  /** 参加方法のタブで、エンジョイ部門を選んだ */
  tabEnjoy: "campaign_tab_enjoy",
  /** 「詳細な作成手順はこちら！」を開いた(クリエイティブ部門) */
  stepsCreative: "campaign_steps_creative",
  /** 「詳細な作成手順はこちら！」を開いた(エンジョイ部門) */
  stepsEnjoy: "campaign_steps_enjoy",
  /** 「詳しい生成のしかたはこちら！」を開いた(生成期間のある企画。2026-10-30 秋のひととき企画から) */
  stepsGenerate: "campaign_steps_generate",
  /** ハッシュタグをコピーできた */
  hashtagCopy: "campaign_hashtag_copy",
  /** 「ログインしてエントリー」を押した */
  entryLogin: "campaign_entry_login",
  /** 「エントリーする」を押した */
  entryClick: "campaign_entry_click",
  /** エントリーできた */
  entryComplete: "campaign_entry_complete",
  /** 対象作品の一覧で、作品を押した */
  workTap: "campaign_work_tap",
  /**
   * ホームの対象作品の棚で、作品を押した(2026-10-17)。
   * ホームで送るので、ページのパスでは企画を分けられない。棚は開催中の企画だけに出すので、期間で分ける
   */
  homeShelfWorkTap: "campaign_home_shelf_work_tap",
  /** ホームの対象作品の棚の「すべて見る」を押した */
  homeShelfAll: "campaign_home_shelf_all",
  /** ホームの棚の上の、エントリーした人の進み具合を押した(企画ページへ。2026-10-17) */
  homeProgressTap: "campaign_home_progress_tap",
  /** ホームの棚の上の、まだエントリーしていない人への「エントリーして、…」を押した(企画ページのエントリーへ。2026-10-25) */
  homeEntryInviteTap: "campaign_home_entry_invite_tap",
  /**
   * 口数のお祝い(1口・2口・3口に届いたとき)を出した(2026-10-17)。
   * 投稿のあとや企画ページで出るので、ページのパスでは企画を分けられない。期間で分ける
   */
  celebrationView: "campaign_celebration_view",
  /** 口数のお祝いの「対象作品をもっと見る」を押した */
  celebrationCatalog: "campaign_celebration_catalog",
  /**
   * 企画の贈り物(2026-10-26)。どのページでも出すので、ページのパスでは企画を分けられない。期間で分ける
   */
  /** 贈り物の画面を出した */
  giftView: "campaign_gift_view",
  /** 5回タップして開けた */
  giftOpen: "campaign_gift_open",
  /** 受け取れた(ログインしている人) */
  giftClaim: "campaign_gift_claim",
  /** 「ログインして受け取る」を押した(ログインしていない人) */
  giftLogin: "campaign_gift_login",
  /** 受け取ったあとの「対象作品を見る」を押した */
  giftWorks: "campaign_gift_works",
} as const;

export type CampaignEventName = (typeof CAMPAIGN_EVENTS)[keyof typeof CAMPAIGN_EVENTS];

export function trackCampaignEvent(name: CampaignEventName): void {
  trackEvent(name);
}

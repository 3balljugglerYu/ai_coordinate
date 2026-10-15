/**
 * 企画のキー(hashtag_campaigns.key)の形。DB の CHECK(^[a-z0-9-]{1,64}$)と同じ。
 * 形が違うものは DB に問い合わせる前に 404 にする。
 */
const CAMPAIGN_KEY_PATTERN = /^[a-z0-9-]{1,64}$/;

export function isHashtagCampaignKey(value: string): boolean {
  return CAMPAIGN_KEY_PATTERN.test(value);
}

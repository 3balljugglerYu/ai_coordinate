/**
 * Xシェア抽選キャンペーンの定義と、応募用 X intent URL の組み立て。
 *
 * 法務方針(オープン懸賞に倒す)に沿った運用の要:
 * - 参加に課金は不要・課金は当選確率に影響しない(規約に明記=/campaigns/<slug>)
 * - 応募=公開アカウントから1人1回、指定ハッシュタグ + 主催者メンション付き投稿
 * - 日本国内居住者・18歳以上限定
 * この設定はLP/応募規約/ボタン文面の単一の真実源。カテゴリkey・期間・タグ・
 * メンション先を1箇所で管理する。
 */
export interface XLotteryCampaign {
  /** 内部ID(ログ・分析用)。 */
  id: string;
  /** 対象コレクションカテゴリ key(上巻・下巻など)。この完走ページにだけ応募ボタンを出す。 */
  categoryKeys: readonly string[];
  /** 応募受付の開始/終了(ISO, UTC)。この期間内だけボタンを表示する。 */
  entryStartsAt: string;
  entryEndsAt: string;
  /** 応募ポストに付けるハッシュタグ(先頭の # は付けない)。 */
  hashtags: readonly string[];
  /** 主催者メンション先(先頭の @ は付けない)。応募回収のため必須。 */
  mention: string;
  /** 応募ポストの定型メッセージ。 */
  message: string;
  /** 応募規約ページのパス。 */
  rulesPath: string;
}

export const X_LOTTERY_CAMPAIGNS: readonly XLotteryCampaign[] = [
  {
    id: "kotowaza-2026-07",
    categoryKeys: ["kotowaza_dictionary", "kotowaza_dictionary_2"],
    // 7/18 (土) 18:00 JST 〜 7/26 (日) 21:59 JST
    entryStartsAt: "2026-07-18T09:00:00.000Z",
    entryEndsAt: "2026-07-26T12:59:59.000Z",
    hashtags: ["うちの子のことわざ辞典"],
    mention: "mickey_fuku",
    message: "うちの子のことわざ辞典をコンプリートしました！",
    rulesPath: "/campaigns/kotowaza-lottery",
  },
];

/**
 * 指定カテゴリで「現在応募受付中」のキャンペーンを返す(無ければ null)。
 * starts/ends の判定は now を基準に inclusive(開始時刻ちょうどは受付、終了時刻は
 * entryEndsAt を過ぎたら締切)。
 */
export function findActiveXLotteryCampaign(
  categoryKey: string | null | undefined,
  now: Date,
  campaigns: readonly XLotteryCampaign[] = X_LOTTERY_CAMPAIGNS,
): XLotteryCampaign | null {
  if (!categoryKey) return null;
  const t = now.getTime();
  for (const c of campaigns) {
    if (!c.categoryKeys.includes(categoryKey)) continue;
    if (t < new Date(c.entryStartsAt).getTime()) continue;
    if (t > new Date(c.entryEndsAt).getTime()) continue;
    return c;
  }
  return null;
}

/**
 * 応募用の X intent(post) URL を組み立てる。
 * text にメッセージ + 主催者メンション、hashtags にタグ、url に台紙シェアURLを渡す。
 * → 投稿には「メッセージ + @メンション + OGPカード + #ハッシュタグ」が入り、
 *   Xガイドラインの「主催者@ユーザー名を含める」を満たしつつ応募回収できる。
 */
export function buildXLotteryIntentUrl(
  campaign: XLotteryCampaign,
  shareUrl: string,
): string {
  const params = new URLSearchParams();
  params.set("text", `${campaign.message} @${campaign.mention}`);
  params.set("url", shareUrl);
  if (campaign.hashtags.length > 0) {
    params.set("hashtags", campaign.hashtags.join(","));
  }
  return `https://x.com/intent/post?${params.toString()}`;
}

import { buildHashtagSearchHref } from "@/lib/hashtag";

/**
 * 11月の企画「うちの子の決めポーズ」の決まり(2026-10-30 ユーザー決定)。
 * 期間・賞品・ハッシュタグを変えるときはここだけ直す。
 *
 * - いろんな決めポーズを募集する。参加は CREATE でポーズのプロンプトを作って投稿(ハロウィンと同じ)
 * - 応募期間のあとに投票期間を置く。投票は「気に入った応募作で生成する」こと。
 *   票はいつもの利用回数(get_prompt_usage_count・作者自身の生成は数えない)で、
 *   応募期間中の生成も含める。新しく数える仕組みは作らない(2026-10-30 ユーザー決定)
 * - 投票した人への賞はない。賞は使われた回数の多い順に決める
 *
 * 結果は画面の利用回数ではなく、期間で区切った数で決める(手順と SQL は docs/planning/kime-pose-campaign.md)。
 */

/**
 * 賞(2026-10-30 ユーザー決定: Amazonギフトカード 5,000円分を1名様、ペルコイン200枚を10名様)。
 * 使われた回数の多い順に決める。Amazonギフトカードは日本国内にお住まいの方だけ、
 * ペルコインは海外にお住まいの方も受け取れる(2026-10-30 ユーザー決定)。
 * 金額は「○○円分」と書く(Amazonギフトカードの注意事項)。ページの文や説明文の金額は、ここから作る。
 */
const PRIZES = [
  {
    icon: "🏆",
    name: "ベスト決めポーズ賞",
    tagline: "いちばん使われた決めポーズ",
    text: "応募期間と投票期間をとおして、いちばん多く使われた決めポーズの作品に贈られる賞です。",
    gift: "Amazonギフトカード",
    amount: "5,000",
    unit: "円分",
    winners: "1名様",
    tone: "gold",
  },
  {
    icon: "✨",
    name: "ナイス決めポーズ賞",
    tagline: "たくさん使われた決めポーズ",
    text: "ベスト決めポーズ賞に続いて、たくさん使われた決めポーズの作品に贈られる賞です。",
    gift: "ペルコイン",
    amount: "200",
    unit: "枚",
    winners: "10名様",
    tone: "silver",
  },
] as const;

const [AMAZON_PRIZE] = PRIZES;

export const KIME_POSE = {
  path: "/campaigns/kime-pose",
  /**
   * DB の hashtag_campaigns.key(応募作の記録・投稿画面のタグ候補)。
   * 応募期間とハッシュタグの正本は DB 側(20261030180000 のマイグレーション)。表示の文字はこのファイル。
   */
  campaignKey: "kime-pose",
  titleJp: "うちの子の決めポーズ",
  titleEn: "Strike a Pose!",
  hashtag: "#うちの子の決めポーズ",
  /** 応募の入口(CREATE = /free) */
  joinHref: "/free",
  /** 応募作をさがす入口(ハッシュタグの検索)。ページに一覧がまだ無いときに使う */
  entriesHref: buildHashtagSearchHref("うちの子の決めポーズ"),
  /**
   * 期間(始まりの時刻ちょうどから、終わりの時刻ちょうどは含まない)。
   * 応募期間の正本は DB の hashtag_campaigns(20261030180000)。ここは画面の出し分けにだけ使う。
   * DB と同じ値であることはテストで確かめる。投票期間は DB に持たない(数える仕組みを作らないため)
   */
  submitStartsAt: "2026-11-01T00:00:00+09:00",
  submitEndsAt: "2026-11-16T00:00:00+09:00",
  voteEndsAt: "2026-11-23T00:00:00+09:00",
  submitStartLabel: "11/1(日) 0:00",
  submitEndLabel: "11/15(日) 23:59",
  voteStartLabel: "11/16(月) 0:00",
  voteEndLabel: "11/22(日) 23:59",
  /** 結果発表(2026-10-30 ユーザー決定: 投票の締め切りの1週間後) */
  announceLabel: "11/29(日)ごろ",
  /** 応募規約に書く期間(年と日本時間つき) */
  submitPeriodFullLabel: "2026年11月1日(日) 0:00 〜 11月15日(日) 23:59（日本時間）",
  votePeriodFullLabel: "2026年11月16日(月) 0:00 〜 11月22日(日) 23:59（日本時間）",
  termsPath: "/campaigns/kime-pose/terms",
  /** キャンペーンのお問い合わせ先(お問い合わせフォーム。ハロウィンと同じ) */
  contactHref: "/my-page/contact",
  prizes: PRIZES,
  /** 「Amazonギフトカード 5,000円分」。冒頭の札・文・ページの説明文に使う(ペルコインは含めない) */
  prizeTotalLabel: `${AMAZON_PRIZE.gift} ${AMAZON_PRIZE.amount}${AMAZON_PRIZE.unit}`,
} as const;

/**
 * 企画のいまの段階。画面の出し分けだけに使う(応募作の記録は DB の期間)。
 * - before: 応募の前
 * - submit: 応募期間(この間の生成も票に入る)
 * - vote: 投票期間(応募は締め切り)
 * - closed: 投票の締め切りのあと(結果発表を待つ)
 */
export type KimePosePhase = "before" | "submit" | "vote" | "closed";

/** @param nowMs いまの時刻(ミリ秒)。テストで差し替える */
export function getKimePosePhase(nowMs: number): KimePosePhase {
  if (nowMs < Date.parse(KIME_POSE.submitStartsAt)) return "before";
  if (nowMs < Date.parse(KIME_POSE.submitEndsAt)) return "submit";
  if (nowMs < Date.parse(KIME_POSE.voteEndsAt)) return "vote";
  return "closed";
}

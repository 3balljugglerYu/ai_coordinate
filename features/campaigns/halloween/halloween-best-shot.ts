import { buildHashtagSearchHref } from "@/lib/hashtag";

/**
 * ハロウィン企画「うちの子のベストショット with Halloween Magic」の決まり(2026-10-11/12 ユーザー決定)。
 * 期間・賞品・ハッシュタグを変えるときはここだけ直す。
 * 使った人の賞(抽選)と口数は 2026-10-14 ユーザー決定。両方の賞には当たらない。
 */
export const HALLOWEEN_BEST_SHOT = {
  path: "/campaigns/halloween-best-shot",
  titleJp: "うちの子のベストショット",
  titleEn: "with Halloween Magic",
  hashtag: "#うちの子のベストショット",
  /** 参加の入口(CREATE = /free) */
  joinHref: "/free",
  /** 応募作をさがす入口(ハッシュタグの検索) */
  entriesHref: buildHashtagSearchHref("うちの子のベストショット"),
  startLabel: "10/16(金) 20:00",
  endLabel: "10/31(土) 23:59",
  announceLabel: "終了後 1週間程度",
  /** つくる人の賞(審査) */
  prizes: [
    { rank: "最優秀賞", amount: "10,000", unit: "円分", winners: "1名様", tone: "gold", medal: "🏆" },
    { rank: "優秀賞", amount: "5,000", unit: "円分", winners: "2名様", tone: "silver", medal: "🎖️" },
  ],
  /** つかう人の賞(抽選) */
  userPrizes: [
    { rank: "Amazonギフト券", amount: "1,000", unit: "円分", winners: "10名様", tone: "gold", medal: "🎁" },
    { rank: "ペルコイン", amount: "300", unit: "枚", winners: "30名様", tone: "silver", medal: "🪙" },
  ],
  /** つかう人の抽選の口数(ちがう応募作をいくつ使って投稿したか)。最大3口 */
  tickets: [
    { works: 3, tickets: 1 },
    { works: 6, tickets: 2 },
    { works: 10, tickets: 3 },
  ],
  prizeTotalLabel: "Amazonギフト券 総額3万円",
} as const;

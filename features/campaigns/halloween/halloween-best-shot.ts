/**
 * ハロウィン企画「うちの子のベストショット with Halloween Magic」の決まり(2026-10-11/12 ユーザー決定)。
 * 期間・賞品・ハッシュタグを変えるときはここだけ直す。
 */
export const HALLOWEEN_BEST_SHOT = {
  path: "/campaigns/halloween-best-shot",
  titleJp: "うちの子のベストショット",
  titleEn: "with Halloween Magic",
  hashtag: "#うちの子のベストショット",
  /** 参加の入口(CREATE = /free) */
  joinHref: "/free",
  startLabel: "10/16(金) 20:00",
  endLabel: "10/31(土) 23:59",
  announceLabel: "終了後 1週間程度",
  prizes: [
    { rank: "最優秀賞", amount: "10,000", winners: "1名様", tone: "gold", medal: "🏆" },
    { rank: "優秀賞", amount: "5,000", winners: "2名様", tone: "silver", medal: "🎖️" },
  ],
  prizeTotalLabel: "Amazonギフト券 総額2万円",
} as const;

import { buildHashtagSearchHref } from "@/lib/hashtag";

/**
 * ハロウィン企画「うちの子のベストショット with Halloween Magic」の決まり(2026-10-11/12 ユーザー決定)。
 * 期間・賞品・ハッシュタグを変えるときはここだけ直す。
 * 使った人の賞(抽選)と口数は 2026-10-14 ユーザー決定。両方の賞には当たらない。
 * 2026-10-15: 抽選はエントリーした人だけ(エントリー前の投稿も数える)。ガチャの応募作も対象。
 */
export const HALLOWEEN_BEST_SHOT = {
  path: "/campaigns/halloween-best-shot",
  /**
   * DB の hashtag_campaigns.key(エントリー・応募作の記録・口数の計算)。
   * 期間とハッシュタグの正本は DB 側(20261015100000 のマイグレーション)。表示の文字はこのファイル。
   */
  campaignKey: "halloween-best-shot",
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
  /**
   * つくる人の賞(審査)。2026-10-15 ユーザー決定で5つ(計34名様)に。
   * サムネイル(thumb)は差し替える予定。今は冒頭の作例(gallery-*.jpg)を仮に使う。差し替えるときは alt も直す。
   */
  prizes: [
    {
      icon: "🏆",
      name: "ハロウィン・ベストショット賞",
      tagline: "総合評価・最高賞",
      text: "ハロウィンの世界観、キャラクターの魅力、構図、演出など、総合的に最も印象に残る作品。",
      criteria: "世界観・完成度・インパクト",
      gift: "Amazonギフトカード",
      amount: "10,000",
      unit: "円分",
      winners: "1名様",
      tone: "gold",
      thumb: { src: "/campaigns/halloween-best-shot/gallery-witch.jpg", alt: "魔女の帽子とステッキで、月夜のお城の前を歩く女の子" },
    },
    {
      icon: "👻",
      name: "トリック・オア・キュート賞",
      tagline: "可愛さ・キャラクター表現",
      text: "思わず笑顔になってしまう、可愛らしさや楽しさがあふれる作品。表情や仕草の魅力を重視。",
      criteria: "可愛さ・表情・愛らしい演出",
      gift: "Amazonギフトカード",
      amount: "5,000",
      unit: "円分",
      winners: "1名様",
      tone: "gold",
      thumb: { src: "/campaigns/halloween-best-shot/gallery-pastel.jpg", alt: "パステルカラーの魔女の衣装で、お菓子の国を歩く女の子" },
    },
    {
      icon: "🪄",
      name: "マジカル・アイデア賞",
      tagline: "発想力・オリジナリティ",
      text: "「こんなハロウィンがあったんだ！」と驚かされる、独創的なアイデアやユニークな演出が光る作品。",
      criteria: "独創性・意外性・プロンプトの工夫",
      gift: "Amazonギフトカード",
      amount: "5,000",
      unit: "円分",
      winners: "1名様",
      tone: "gold",
      thumb: { src: "/campaigns/halloween-best-shot/gallery-cat.jpg", alt: "黒猫の耳としっぽを付けて、ランタンの灯る遺跡ではしゃぐ女の子" },
    },
    {
      icon: "🌙",
      name: "ミッドナイト・マジック賞",
      tagline: "幻想美・神秘的な世界観",
      text: "月明かりや星空、幻想的な光の演出など、ハロウィンの夜ならではの美しさや神秘的な雰囲気を表現した作品に贈られる賞。",
      criteria: "幻想的な美しさ・色彩・光の演出・世界観",
      gift: "Amazonギフトカード",
      amount: "5,000",
      unit: "円分",
      winners: "1名様",
      tone: "gold",
      thumb: { src: "/campaigns/halloween-best-shot/gallery-moonlight.jpg", alt: "紫のドレスで、満月の夜の遺跡にたたずむ女の子" },
    },
    {
      icon: "🎃",
      name: "ハロウィン・セレクション賞",
      tagline: null,
      text: "ハロウィンの魅力を感じる、素敵な作品30点を選出。特別賞に次ぐ入選作品として表彰します。",
      criteria: null,
      gift: "ペルコイン",
      amount: "200",
      unit: "枚",
      winners: "30名様",
      tone: "silver",
      thumb: { src: "/campaigns/halloween-best-shot/gallery-market.jpg", alt: "オレンジのジャケットで、ハロウィンのお菓子の市場に立つ女の子" },
    },
  ],
  /**
   * つかう人の賞(抽選)。2026-10-15 ユーザー決定で賞の名前と説明を付け、つくる人の賞と同じ形で出す。
   * トリック・オア・コイン賞は同日 300枚 → 200枚(ユーザー指示)。
   * サムネイルは仮。ペルコインの賞はペルコインの絵(余白つきで収める)、Amazonギフトカードの賞は合う絵がまだ無いので絵文字。
   * 名前とねらいの「|」は、狭い幅で折り返してよい位置(画面には出さない)。
   */
  userPrizes: [
    {
      icon: "🏆",
      name: "ハロウィン・マスター賞",
      tagline: "たくさんのプロンプトを|楽しんだ利用者へ",
      text: "みんなが投稿したハロウィンのプロンプトを使って、たくさんの「うちの子」のベストショットを生み出してくれた方に、抽選で贈られる賞です！🎃",
      criteria: null,
      gift: "Amazonギフトカード",
      amount: "1,000",
      unit: "円分",
      winners: "10名様",
      tone: "gold",
      thumb: { emoji: "🎁" },
    },
    {
      icon: "🪙",
      name: "トリック・オア・コイン賞",
      tagline: "ハロウィンのプロンプトを|楽しんでくれた利用者へ",
      text: "ハロウィンのプロンプトを使って、イベントを一緒に盛り上げてくれた方に、抽選で贈られる賞です！✨",
      criteria: null,
      gift: "ペルコイン",
      amount: "200",
      unit: "枚",
      winners: "30名様",
      tone: "silver",
      thumb: { src: "/percoin/percoin3.webp", alt: "", contain: true },
    },
  ],
  /** つかう人の抽選の口数(ちがう応募作をいくつ使って投稿したか)。最大3口 */
  tickets: [
    { works: 3, tickets: 1 },
    { works: 6, tickets: 2 },
    { works: 10, tickets: 3 },
  ],
  /** つくる人 25,000円(1万+5千×3) + つかう人 10,000円(千×10)。ペルコインは含めない */
  prizeTotalLabel: "Amazonギフトカード 総額3.5万円",
} as const;

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
   * サムネイル(thumb)は、ユーザーが用意した賞ごとの正方形の画像(2026-10-15。1254px の PNG を 800px の JPEG にして置いた)。
   * 画像の中の文字は alt にも書く。差し替えるときは alt も直す。
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-best-shot.jpg",
        alt: "「ハロウィン・ベストショット賞 総合的に最も魅力的な作品」の文字と、金のトロフィーを掲げる魔女の女の子のイラスト",
      },
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-cute.jpg",
        alt: "「トリック・オア・キュート賞 可愛さや愛らしさが際立つ作品」の文字と、おばけのぬいぐるみを抱いてウインクする女の子のイラスト",
      },
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-idea.jpg",
        alt: "「マジカル・アイデア賞 独創的な発想や演出が光る作品」の文字と、魔法の本から紫の光を出す魔女の女の子のイラスト",
      },
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-midnight.jpg",
        alt: "「ミッドナイト・マジック賞 幻想的で美しい世界観を表現した作品」の文字と、満月の夜に光る水晶玉を持つ女の子のイラスト",
      },
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-selection.jpg",
        alt: "「ハロウィン・セレクション賞 ハロウィンの魅力が詰まった素敵な作品」の文字と、ジャック・オ・ランタンを抱える女の子のイラスト",
      },
    },
  ],
  /**
   * つかう人の賞(抽選)。2026-10-15 ユーザー決定で賞の名前と説明を付け、つくる人の賞と同じ形で出す。
   * トリック・オア・コイン賞は同日 300枚 → 200枚(ユーザー指示)。
   * サムネイルは、つくる人の賞と同じくユーザーが用意した正方形の画像(2026-10-15)。
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-master.jpg",
        alt: "「ハロウィン・マスター賞 たくさんのプロンプトを楽しんでくれた利用者へ」の文字と、かぼちゃの絵のカードを手にウインクする魔女の女の子のイラスト",
      },
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
      thumb: {
        src: "/campaigns/halloween-best-shot/prize-coin.jpg",
        alt: "「トリック・オア・コイン賞 ハロウィンのプロンプトを楽しんでくれた利用者へ」の文字と、宝箱からあふれるコインに手を広げる魔女の女の子のイラスト",
      },
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

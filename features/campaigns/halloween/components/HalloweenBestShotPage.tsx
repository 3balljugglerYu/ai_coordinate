import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { SignupSourceCapture } from "@/features/auth/components/SignupSourceCapture";
import { AnnotatedShot, type ShotBox, type ShotCallout } from "@/features/guide/components/AnnotatedShot";
import type { CampaignSubmissionItem } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { CAMPAIGN_EVENTS } from "@/features/campaigns/lib/campaign-events";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";
import styles from "../halloween.module.css";
import { ENJOY_JOIN_TAB_KEY } from "../lib/join-guide-requests";
import { CopyHashtagButton } from "./CopyHashtagButton";
import { EntryProgressCard, EntryProgressProvider } from "./EntryProgressCard";
import { AmazonGiftCardNotice } from "./AmazonGiftCardNotice";
import { AboutDecorations, Bunting, HeroDecorations, Wave } from "./HalloweenDecorations";
import { HeroGallery } from "./HeroGallery";
import { JoinDetails } from "./JoinDetails";
import { JoinTabs } from "./JoinTabs";
import { FloatingJoinButtons, HALLOWEEN_PAGE_END_ID } from "./FloatingJoinButtons";
import { HashTargetScroll } from "./HashTargetScroll";
import { RevealOnScroll } from "./RevealOnScroll";
import { SubmissionCarousel } from "./SubmissionCarousel";

/**
 * ハロウィン企画「うちの子のベストショット with Halloween Magic」のページ(2026-10-12)。
 * 見た目は見本(今/変更後)でユーザーが確認済み。参加は CREATE でプロンプトを作って投稿。
 * 2026-10-14: 応募作を使って投稿する人(つかう人)の賞と手順を追加。参加方法はタブで分ける。
 * 2026-10-14: 審査があるのはつくる人の賞だけなので、審査のポイントは独立した区画をやめて
 * 参加方法の「つくる人」タブの中(手順の下)に置く。
 * 2026-10-15: Amazon のキャンペーンページを参考に、企画についての上へ「キャンペーン対象の投稿」
 * (応募作がまだないあいだは出さない)を置く。抽選はエントリーした人だけ。ガチャの応募作も対象にする。
 * 2026-10-15: エントリー(つかう人の抽選の進捗バー)は、独立した区画をやめて「つかう人」タブの手順1の中に置く
 * (ユーザー指示。つかう人のための仕組みなので、つかう人の手順の中にあるほうが分かりやすい)。
 * 2026-10-15: 画面での呼び名は、見出しを「キャンペーン対象作品」、文中を「対象作品」にそろえる
 * (「応募作」「キャンペーン対象の投稿」などが混ざっていた。数える単位の「3作品で1口」とも合わせる)。
 * コードと DB では、これまでどおり応募作(submissions)と呼ぶ。
 * 2026-10-15: つくる側の賞を5つ(ハロウィン・ベストショット賞ほか・計34名様)にし、つかう側の賞にも名前
 * (ハロウィン・マスター賞・トリック・オア・コイン賞)を付けて、どちらもユーザーの見本どおりサムネイル付きの一覧で出す。
 * 賞品は賞ごとに書くので「Amazonギフト券でお贈りします」の注意はやめる(セレクション賞はペルコイン)。
 * 呼び名はユーザーの文と同じ「Amazonギフトカード」にそろえる。賞品は部門に分けて「クリエイティブ部門(全5賞)」
 * 「エンジョイ部門(全2賞)」と見出しを付ける。参加方法のタブや読み上げの名前も、画面では「つくる人」「つかう人」と
 * 書かずに部門の呼び名にそろえる(統一感のため。ユーザー指示)。
 * 2026-10-15: 賞品の区画の口数の表(「ちがう対象作品を使うほど、当たりやすく！」)はやめる。同じ表が
 * 参加方法のエンジョイ部門の手順にあるため(ユーザー指示)。
 */

function Ribbon({ en, children }: { en: string; children: string }) {
  return (
    <h2 className={styles.ribbon}>
      <span className={`${styles.ribbonEn} ${styles.en}`}>{en}</span>
      {children}
    </h2>
  );
}

/**
 * 対象作品へのリンク。このページの一覧に作品があれば一覧へ、まだ無ければハッシュタグの検索へ。
 * 検索には、タグが付いていても対象にならない投稿(期間前・ワンタップ・人のプロンプトで作った投稿)も
 * 出てくるので、一覧があるときは一覧を見せる(2026-10-15 ユーザー決定)。
 */
const WORKS_ANCHOR = "#hbs-works";

function WorksLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  // ページの中へ飛ぶときは素の a(Link を通さない)
  return href.startsWith("#") ? (
    <a className={className} href={href}>
      {children}
    </a>
  ) : (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

/**
 * 参加方法の部門ごとのひとこと(2026-10-16 ユーザー指示: いきなり作成手順を見せると嫌気がさすので、
 * まずひとことで伝え、詳しい手順は開いて見る)。ひとことはユーザーの文のまま。
 * 数えてもらうのに欠かせない条件(クリエイティブ部門はハッシュタグ、エンジョイ部門はエントリー)だけ、下に小さく添える。
 */
function JoinSummary({ button, note, hashtag = false }: { button: string; note: string; hashtag?: boolean }) {
  return (
    <div className={styles.joinSummary} data-testid="halloween-join-summary">
      <p className={styles.joinSummaryText}>
        <span className={styles.nowrap}>
          <strong className={styles.keyWord}>「{button}」</strong>から
        </span>
        <Phrases text="生成して|投稿するだけで|OK！" />
      </p>
      <p className={styles.joinSummaryNote}>※ {note}</p>
      {hashtag ? (
        <div className={styles.hashtagRow}>
          <span className={styles.hashtag}>{CAMPAIGN.hashtag}</span>
          <CopyHashtagButton hashtag={CAMPAIGN.hashtag} />
        </div>
      ) : null}
    </div>
  );
}

interface JoinStep {
  title: string;
  text: string;
  shot?: {
    src: string;
    alt: string;
    width: number;
    height: number;
    rings: ShotBox[];
    callouts: ShotCallout[];
    /** 画面まるごとのスクショはスマホの外枠で囲む */
    device?: boolean;
  };
  /** 画面の赤枠の番号(1, 2, 3…)と対応させる箇条 */
  points?: readonly string[];
  hashtag?: boolean;
  /** 応募作をさがす(ハッシュタグの検索)へのボタン */
  entriesLink?: boolean;
  /** 抽選の口数の表 */
  tickets?: boolean;
}

// 画面のスクショはガチャの紹介ページ(/guide/gacha)の実画面を使う(手順3は画像、手順4はプロンプトの文、手順5はモデル名だけ差し替えた版)。枠の位置は画像に対する割合(%)。
const GUIDE_IMG = "/guide/gacha";

const POST_SHOT: NonNullable<JoinStep["shot"]> = {
  src: "/campaigns/halloween-best-shot/join-7-post.jpg",
  alt: "生成した画像を大きく開いた画面。上に並ぶボタンのうち「＋ 投稿」を赤い枠で囲んでいる",
  width: 780,
  height: 1515,
  device: true,
  rings: [{ left: 60.5, top: 0.8, width: 17.5, height: 4.6 }],
  callouts: [{ left: 34, top: 8, text: "ここをタップ", pointer: "up-end" }],
};

/** エンジョイ部門の「投稿」の画像。押す場所は同じで、拡大表示の絵だけユーザーの画像に差し替えた版(2026-10-15) */
const USER_POST_SHOT: NonNullable<JoinStep["shot"]> = {
  ...POST_SHOT,
  src: "/campaigns/halloween-best-shot/use-5-post.jpg",
};

/** つくる人(応募作のプロンプトを作って投稿する人)の手順 */
const CREATOR_STEPS: readonly JoinStep[] = [
  {
    title: "「カタログ」を開く",
    text: "画面の下にある「カタログ」をタップします。",
    shot: {
      src: `${GUIDE_IMG}/where-1-home.jpg`,
      alt: "ホーム画面。下のメニューの「カタログ」を赤い枠で囲んでいる",
      width: 780,
      height: 1328,
      device: true,
      rings: [{ left: 21, top: 90, width: 18, height: 9.6 }],
      callouts: [{ left: 8, top: 78, text: "ここをタップ", pointer: "down" }],
    },
  },
  {
    title: "「CREATE」を選ぶ",
    text: "カタログの上にあるタブから「CREATE」を選びます。",
    shot: {
      src: `${GUIDE_IMG}/where-2-catalog.jpg`,
      alt: "カタログの画面。上のタブの「CREATE」を赤い枠で囲んでいる",
      width: 780,
      height: 1328,
      device: true,
      rings: [{ left: 70, top: 17, width: 26.5, height: 8.3 }],
      callouts: [{ left: 40, top: 28, text: "CREATEを選ぶ", pointer: "up-end" }],
    },
  },
  {
    title: "うちの子の画像を入れる",
    text: "「人物画像をアップロード」から、うちの子の画像を選びます。",
    shot: {
      src: "/campaigns/halloween-best-shot/join-3-image.jpg",
      alt: "人物画像をアップロードする欄に、うちの子の画像が入っている",
      width: 780,
      height: 700,
      rings: [{ left: 9, top: 21, width: 82, height: 63 }],
      callouts: [{ left: 50, top: -6, text: "うちの子の画像", pointer: "down" }],
    },
  },
  {
    title: "ハロウィンのプロンプトを書く",
    text: "「生成したい内容」に、ハロウィンの衣装・ポーズ・背景などを自由に書きます。ガチャプロンプトでもOKです。",
    shot: {
      src: "/campaigns/halloween-best-shot/join-4-prompt.jpg",
      alt: "生成したい内容の欄にハロウィンの衣装のプロンプトが入っていて、その下のガチャプロンプトにするのチェックはオフ",
      width: 780,
      height: 460,
      rings: [{ left: 9.5, top: 18, width: 81.5, height: 52 }],
      callouts: [{ left: 30, top: -5, text: "ここにプロンプトを書く", pointer: "down" }],
    },
  },
  {
    title: "「コーデ開始！」で生成する",
    text: "うちの子のハロウィンのイラストができあがります。",
    shot: {
      src: "/campaigns/halloween-best-shot/join-5-generate.jpg",
      alt: "生成の設定と、いちばん下のコーデ開始！のボタン",
      width: 780,
      height: 736,
      rings: [{ left: 9, top: 83.5, width: 82, height: 15 }],
      callouts: [{ left: 20, top: 100.5, text: "ここをタップ", pointer: "up" }],
    },
  },
  {
    title: "できあがったら、サムネイルをタップ",
    text: "生成されたイラストの小さな画像(サムネイル)をタップして開きます。",
  },
  {
    title: "「投稿」をタップ",
    text: "画像が大きく開いたら、上にある「＋ 投稿」をタップします。",
    shot: POST_SHOT,
  },
  {
    title: "説明とハッシュタグを付けて投稿！",
    text: "投稿の画面で、次の3つをします。",
    points: [
      "「キャプション」に、イラストの説明とハッシュタグを入れる",
      "「生成前の画像も表示する」にチェックを入れる",
      "「投稿する」をタップ",
    ],
    hashtag: true,
    shot: {
      // 2026-10-16: 期間中は投稿画面のタグ候補のいちばん前に企画のタグが出る(#753)ので、
      // その行が写った画像にした(v3・ユーザー指示)。もとの画面の写真(v2)は変えず、キャプションの
      // タグを消して(タグ候補はまだ入っていないタグだけ出る)、本物の部品で描いたタグ候補の行を差し込んだ。
      // 10/13 に消した「タグ候補」は企画と関係のないタグだったもの。今回は企画のタグ1つだけ
      src: "/campaigns/halloween-best-shot/join-8-post-form-v3.jpg",
      alt: "画像を投稿する画面。1 キャプションの欄とその下のタグ候補「#うちの子のベストショット」、2 生成前の画像も表示するのチェック、3 投稿するのボタンを赤い枠で囲んでいる",
      width: 780,
      height: 928,
      rings: [
        // 左の端は「タグ候補」の文字にかからないよう、2 と同じところから
        { left: 2.3, top: 49.65, width: 94.4, height: 29.67 },
        { left: 2.3, top: 86.56, width: 45, height: 5.79 },
        { left: 75, top: 1.31, width: 21.5, height: 7.84 },
      ],
      callouts: [
        { left: 88.5, top: 46, text: "1", pointer: "none" },
        { left: 48.5, top: 85.26, text: "2", pointer: "none" },
        { left: 66.5, top: 2.8, text: "3", pointer: "none" },
        // 幅 320px でも1行に収まる長さにする(「タップでタグが入る」は2行に折れてタグ候補に重なった)
        // 吹き出しの大きさは画面の幅で変わらないので、狭い画面でも三角がタグ候補の文字にかからない高さに置く
        { left: 16, top: 62, text: "タップで入る", pointer: "down" },
      ],
    },
  },
  {
    title: "完了！",
    text: "投稿したイラストは「みんなのカタログ」に並びます。ほかの人もあなたのプロンプトで、自分の子のハロウィンをつくれます。",
  },
];

/** つかう人(応募作のプロンプトで生成して投稿する人)の手順 */
const USER_STEPS: readonly JoinStep[] = [
  {
    title: "エントリーする",
    // 2026-10-16: エントリーのカードは、閉じた手順の外(ひとことのすぐ下)に出す。閉じたままでもエントリーできるように
    text: "上のカードの「エントリーする」をタップします。",
  },
  {
    title: "対象作品をさがす",
    text: `期間中に「${CAMPAIGN.hashtag}」のタグを付けて投稿された作品が、キャンペーン対象作品です。画像の左上の「${CAMPAIGN.targetBadgeLabel}」のラベルが目印です。下の「対象作品を見る」から、まとめて見られます。`,
    entriesLink: true,
    shot: {
      // 2026-10-16: 対象作品に付くラベル(#759)の見本(ユーザー指示)。ホームのフィードのカードを本物の部品で描いて写した
      // (運営のアカウントの投稿として、企画のタグ付き・期間中の投稿の形で描いたもの)。
      // 絵とキャプションは、ハロウィンらしいもの(ユーザーが用意したイラスト・「ハロウィンマジック♪」)に差し替えた(v2・ユーザー指示)。
      // 枠をラベルから離せるよう、カードのまわりに白い余白を付けた(ぴったりだと分かりにくい。10/16 ユーザー指示)
      src: "/campaigns/halloween-best-shot/use-2-target-badge-v2.webp",
      alt: "ホームの投稿のカード。画像の左上の「ハロウィン企画対象！」のラベルを赤い枠で囲んでいる",
      width: 812,
      height: 724,
      rings: [{ left: 1.72, top: 39.57, width: 37.93, height: 12.64 }],
      callouts: [{ left: 41.38, top: 41.62, text: "これが目印", pointer: "left" }],
    },
  },
  {
    title: "「このカタログで|生成する」|をタップ",
    text: "使いたい対象作品の下にあるボタンをタップします。フォローしていない人の対象作品では「フォローして生成する」と出るので、そのままタップすればOKです。",
    shot: {
      // 2026-10-15: フォロー済みの人が見る今の画面(「カタログ作成者」の枠と「このカタログで生成する」)に差し替え
      // (ユーザー指示)。本物の部品をフォロー済みの状態で描いて写したもの。もとの /use-prompts の画像は刷新前の画面
      // 2026-10-16: 対象作品のボタンがハロウィン仕様(紫 → オレンジ・🎃。#759)になったので撮り直した(ユーザー指示)。
      // 流れる動きは、止まって見えたときの色のこまで写した。ボタンの位置と大きさは前の画像と同じ(赤い枠はそのまま)
      src: "/campaigns/halloween-best-shot/use-3-catalog-button-v2.webp",
      alt: "対象作品の下に出る「カタログ作成者」の枠。ハロウィン仕様(紫からオレンジ)の「このカタログで生成する」のボタンを赤い枠で囲んでいる",
      width: 780,
      height: 309,
      rings: [{ left: 4.9, top: 59.2, width: 55.4, height: 28.5 }],
      callouts: [{ left: 44, top: 22, text: "ここをタップ", pointer: "down" }],
    },
  },
  {
    title: "うちの子の画像を|入れて生成",
    text: "うちの子の画像を選んで「コーデ開始！」をタップします。プロンプトの中身が伏せられていても大丈夫。",
    shot: {
      // 2026-10-15: アップロード欄の絵をユーザーの画像に差し替えた版(もとは /use-prompts/step3-sub.webp。案内ページは変えない)
      src: "/campaigns/halloween-best-shot/use-4-upload.webp",
      alt: "生成の画面。人物画像をアップロードする欄に、うちの子の画像が入っている",
      width: 560,
      height: 921,
      rings: [{ left: 4, top: 6.5, width: 92, height: 34 }],
      callouts: [{ left: 50, top: 1, text: "うちの子の画像", pointer: "down" }],
    },
  },
  {
    title: "できあがったら|「投稿」をタップ",
    text: "サムネイルをタップして画像を開き、上にある「＋ 投稿」をタップします。",
    shot: USER_POST_SHOT,
  },
  {
    title: "カウントが|増えていることを|確認！",
    text: "投稿したら、上のエントリーのカードでカウントが増えていることを確かめましょう。対象作品から生成した投稿は、ハッシュタグを付けなくても自動で数えます。",
    shot: {
      // エントリー済みで4作品使ったときのカード(本物のカードを、進捗の返事だけ差し替えて写したもの)
      src: "/campaigns/halloween-best-shot/use-6-count.webp",
      alt: "エントリーのカード。10段のバーのうち4段が埋まり、「現在 4作品(1口)」「あと2作品で2口！」と出ている",
      width: 572,
      height: 862,
      rings: [],
      callouts: [],
    },
  },
  {
    title: "ちがう対象作品で、|当選率アップ！",
    text: "ちがう対象作品を使って投稿するほど、抽選の口数が増えます(最大3口)。",
    tickets: true,
  },
];

const JUDGE_POINTS = [
  { icon: "🎃", name: "ハロウィンらしさ", text: "ひと目でハロウィンの世界観や魅力が伝わるか" },
  { icon: "💖", name: "うちの子らしさ", text: "その子ならではの魅力が輝く「ベストショット」になっているか" },
  {
    icon: "🪄",
    name: "使ってみたくなる魅力",
    text: "ほかの人が「自分のうちの子でも試してみたい！」と思えるプロンプトか",
  },
] as const;

const MORE_TIPS = [
  { icon: "📣", text: "Xにシェアすると、あなたのプロンプトを使ってくれる人が増えるかも！？" },
  { icon: "💖", text: "運営も「いいね」などで応援します！" },
] as const;

type PrizeCategory = (typeof CAMPAIGN.prizeCategories)[keyof typeof CAMPAIGN.prizeCategories];

/**
 * 参加方法のタブの名前(部門の呼び名)。スマホのタブの幅では「クリエイティブ部門」が1行に入らないので、
 * 2つのタブとも「部門」を2行目に回して形をそろえる(PC は1行。CSS の .tabLabelTail)。
 */
function CategoryTabLabel({ name }: { name: string }) {
  const tail = "部門";
  if (!name.endsWith(tail)) return name;
  return (
    <>
      {name.slice(0, -tail.length)}
      <span className={styles.tabLabelTail}>{tail}</span>
    </>
  );
}

/** 賞の部門の見出し(「全○賞」は賞の数)と、その下のひとこと(2026-10-15 ユーザー決定) */
function PrizeCategoryHeading({ category, count }: { category: PrizeCategory; count: number }) {
  return (
    <>
      <h3 className={styles.prizeGroup}>
        <span aria-hidden="true">{category.icon}</span> {category.name}
        <small>（全{count}賞）</small>
      </h3>
      <p className={styles.prizeGroupLead}>{category.lead}</p>
    </>
  );
}

type Award = (typeof CAMPAIGN.prizes)[number] | (typeof CAMPAIGN.userPrizes)[number];

/**
 * 狭い幅でも言葉の途中で折り返さないよう、「・」の後ろと「|」の位置だけを折り返してよい所にする
 * (「|」は画面に出さない。CSS の word-break: keep-all と組み合わせる)。
 */
function BreakHints({ text }: { text: string }) {
  return text.split("|").map((chunk, chunkIndex) => (
    <Fragment key={chunkIndex}>
      {chunkIndex > 0 ? <wbr /> : null}
      {chunk.split("・").map((part, index, parts) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 ? (
            <>
              ・<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </Fragment>
  ));
}

/**
 * 企画についての文: 「|」で区切った文節の切れ目でだけ折り返す(文節の中では折らない)。
 * 「」のあとの「を」「の」が行の頭に来たり、文末の絵文字だけが次の行に落ちたりしない。
 * 端の「|」は、となりの言葉との切れ目で折り返してよい印。「|」は画面に出さない
 */
function Phrases({ text }: { text: string }) {
  return text.split("|").map((chunk, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {chunk ? <span className={styles.nowrap}>{chunk}</span> : null}
    </Fragment>
  ));
}

/**
 * 賞の一覧(2026-10-15 ユーザーの見本。つくる人・つかう人とも同じ形)。
 * 左にサムネイル(ユーザーが用意した賞ごとの正方形の画像)、右に賞の名前・ねらい・賞品と人数・説明・評価
 * (評価は審査のある賞だけ)。
 * スマホはサムネイルの右に名前とねらいだけを置き、賞品と人数・説明・評価は下の全幅に回す
 * (「Amazonギフトカード 10,000円分」の札はサムネイルの右の幅に入りきらない)。
 */
function AwardList({ prizes, testId }: { prizes: readonly Award[]; testId: string }) {
  return (
    <ul className={styles.awards}>
      {prizes.map((prize) => (
        <li key={prize.name} className={styles.award} data-testid={testId}>
          <div className={styles.awardThumb}>
            <Image
              src={prize.thumb.src}
              alt={prize.thumb.alt}
              fill
              sizes="(min-width: 860px) 168px, 112px"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className={styles.awardHead}>
            <h4 className={styles.awardName}>
              <span aria-hidden="true">{prize.icon}</span> <BreakHints text={prize.name} />
            </h4>
            {prize.tagline ? (
              <p className={styles.awardTagline}>
                <BreakHints text={prize.tagline} />
              </p>
            ) : null}
          </div>
          <p className={styles.awardGift} data-testid="halloween-prize-gift">
            <span
              className={`${styles.awardGiftItem} ${prize.tone === "gold" ? styles.awardGiftGold : styles.awardGiftSilver}`}
            >
              {prize.gift} <b>{prize.amount}</b>
              {prize.unit}
            </span>
            <span className={styles.awardWinners}>{prize.winners}</span>
          </p>
          <div className={styles.awardBody}>
            <p className={styles.awardText}>{prize.text}</p>
            {prize.criteria ? <p className={styles.awardCriteria}>評価：{prize.criteria}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function JudgePoints() {
  return (
    <div className={styles.judge}>
      <h3 className={styles.judgeTitle}>
        <span aria-hidden="true">🏆</span> 審査のポイント
      </h3>
      <div className={styles.points}>
        {JUDGE_POINTS.map((point) => (
          <div key={point.name} className={styles.point} data-testid="halloween-judge-point">
            <span aria-hidden="true">{point.icon}</span>
            <span>
              <b>{point.name}</b>：{point.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketTable() {
  return (
    <ul className={styles.tickets} data-testid="halloween-tickets">
      {CAMPAIGN.tickets.map((row) => (
        <li key={row.tickets} className={styles.ticket}>
          <span className={styles.ticketWorks}>
            <b className={styles.en}>{row.works}</b>作品
          </span>
          <span className={styles.ticketArrow} aria-hidden="true">
            ▶
          </span>
          <span className={styles.ticketCount}>
            <b className={styles.en}>{row.tickets}</b>口
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepList({
  steps,
  role,
  worksHref,
}: {
  steps: readonly JoinStep[];
  role: "creator" | "user";
  worksHref: string;
}) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => (
        <li key={step.title} className={styles.step} data-testid={`halloween-join-step-${role}`}>
          <div className={styles.stepHead}>
            <span className={`${styles.stepNum} ${styles.en}`} aria-hidden="true">
              {index + 1}
            </span>
            {/* 題名の「|」は、狭い幅で折り返してよい位置(画面には出さない)。入れた題名は言葉の途中で折らない */}
            <h3 className={`${styles.stepTitle} ${step.title.includes("|") ? styles.stepTitleHinted : ""}`}>
              <BreakHints text={step.title} />
            </h3>
          </div>
          <p className={styles.stepText}>{step.text}</p>
          {step.points ? (
            <ol className={styles.stepPoints}>
              {step.points.map((point, pointIndex) => (
                <li key={point}>
                  <span className={styles.stepPointNum} aria-hidden="true">
                    {pointIndex + 1}
                  </span>
                  {point}
                </li>
              ))}
            </ol>
          ) : null}
          {step.hashtag ? (
            <div className={styles.hashtagRow}>
              <span className={styles.hashtag}>{CAMPAIGN.hashtag}</span>
              <CopyHashtagButton hashtag={CAMPAIGN.hashtag} />
            </div>
          ) : null}
          {step.entriesLink ? (
            <WorksLink className={styles.entriesLink} href={worksHref}>
              対象作品を見る
              <span aria-hidden="true">→</span>
            </WorksLink>
          ) : null}
          {step.tickets ? <TicketTable /> : null}
          {step.shot ? (
            <AnnotatedShot
              src={step.shot.src}
              alt={step.shot.alt}
              width={step.shot.width}
              height={step.shot.height}
              device={step.shot.device}
              rings={step.shot.rings}
              callouts={step.shot.callouts}
              className={step.shot.device ? undefined : "mt-9"}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** 対象作品の数(ページに分けた一覧の件数の合計) */
function countWorks(pages: readonly (readonly CampaignSubmissionItem[])[]): number {
  return pages.reduce((total, page) => total + page.length, 0);
}

/**
 * 企画が終わったあと、いちばん下と対象作品の上に出すお礼(2026-11-01)。
 * スマホ幅の大きな見出しで「ありがとうござ／いました」と折れないよう、文節の切れ目でだけ折り返す
 */
const THANKS_PHRASES = "たくさんの|ご参加、|ありがとう|ございました！";

export function HalloweenBestShotPage({
  submissionPages = [],
  ended = false,
}: {
  /** キャンペーン対象の投稿(9件ずつのページ)。空なら区画ごと出さない */
  submissionPages?: readonly CampaignSubmissionItem[][];
  /**
   * 企画が終わったあとの表示にする(2026-11-01 ユーザー指示)。
   * 浮いたボタン・対象作品の上のエントリー・参加方法は出さず、エントリーの状態も読みに行かない。
   * 対象作品の一覧・企画について・賞品・スケジュール・その他は残す
   */
  ended?: boolean;
}) {
  const worksHref = submissionPages.length > 0 ? WORKS_ANCHOR : CAMPAIGN.entriesHref;
  // 終わったあとはエントリーのカードを1枚も描かないので、状態を読み込む入れ物も置かない
  const EntryStateScope = ended ? Fragment : EntryProgressProvider;
  return (
    <div className={styles.page} data-testid="halloween-best-shot">
      <header className={styles.hero}>
        <HeroDecorations />
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <div className={styles.chips}>
              <span className={`${styles.chip} ${styles.chipHot}`}>🎃 ハロウィン企画</span>
              <span className={styles.chip}>{CAMPAIGN.prizeTotalLabel}</span>
            </div>
            <h1 className={styles.title}>
              <span className={styles.titleJp}>
                うちの子の
                <br />
                ベストショット
              </span>
              <span className={`${styles.titleEn} ${styles.en}`}>
                with Halloween <span className={styles.magic}>Magic</span>
              </span>
            </h1>
            <p className={styles.lead}>
              {/* 2026-10-16: 略称「アマギフ」と、全員もらえるように読める「GETしよう」をやめた(Amazonギフトカードの注意事項) */}
              あなたの“うちの子”が一番かがやくハロウィンをペルスタに投稿して、Amazonギフトカードを当てよう！
            </p>
            <div className={styles.period}>
              {ended ? (
                <span className={styles.periodEnded} data-testid="halloween-period-ended">
                  募集は終了しました
                </span>
              ) : null}
              <span className={styles.periodLabel}>開催期間</span>
              <span className={styles.periodDates}>
                {CAMPAIGN.startLabel} 〜 {CAMPAIGN.endLabel}
              </span>
              <span className={styles.periodNote}>結果発表：{CAMPAIGN.announceLabel}</span>
            </div>
          </div>
          <HeroGallery />
        </div>
        <Wave className={styles.wave} />
      </header>

      <main>
        {/* 対象作品の上と手順1のエントリーのカードは、同じ状態を使う(2026-10-24) */}
        <EntryStateScope>
          {submissionPages.length > 0 ? (
            <>
              {/*
                2026-10-24 ユーザー指示: 対象作品の上にもエントリーを置き、とりあえずエントリーしてもらう
                (使って投稿した23人のうち、エントリーは8人だった)。手順1のカードも残す。
                作品が1画面目に見えるよう、こちらは短いカードにして、詳しくは参加方法へ案内する。
                2026-10-25 ユーザー指示: 対象作品とは別の項目にして、対象作品の上に置く
              */}
              {ended ? null : (
                <section className={styles.section} aria-labelledby="hbs-entry-top" data-testid="halloween-works-entry">
                  <div className={styles.wrap}>
                    <div id="hbs-entry-top">
                      <Ribbon en="ENTRY">エントリー</Ribbon>
                    </div>
                    <EntryProgressCard compact />
                  </div>
                </section>
              )}

              <section className={`${styles.section} ${styles.worksSection}`} aria-labelledby="hbs-works">
                <div className={styles.wrap}>
                  <div id="hbs-works">
                    <Ribbon en="WORKS">キャンペーン対象作品</Ribbon>
                  </div>
                  <p className={styles.worksLead}>
                    {ended ? <Phrases text={THANKS_PHRASES} /> : "タップして、うちの子で生成してみよう！"}
                  </p>
                  {/* 2026-10-25 ユーザー指示: 対象作品の数を出す(下の一覧と同じ数。押して使える作品だけ) */}
                  <p className={styles.worksTotal} data-testid="halloween-works-count">
                    {ended ? "対象作品は" : "現在、対象作品は"}
                    <strong className={styles.worksTotalNumber}>{countWorks(submissionPages)}</strong>
                    {ended ? "作品でした！" : "作品！"}
                  </p>
                  <RevealOnScroll className={styles.reveal}>
                    <SubmissionCarousel pages={submissionPages} />
                  </RevealOnScroll>
                </div>
              </section>
            </>
          ) : null}

          <section className={styles.section} aria-labelledby="hbs-about">
            <div className={styles.wrap}>
              <div id="hbs-about">
                <Ribbon en="ABOUT">企画について</Ribbon>
              </div>
              {/* 2026-10-16 ユーザーの文に差し替え。ユーザー指示で、色の下線(やわらかいマーカー)・大きな「カタログ化」(グラデーションの文字)・角の飾りでポップに。
                  カタログ化は大切なポイントなので2か所とも目立たせる。文は「|」で区切った文節の切れ目でだけ折り返す(Phrases) */}
              <RevealOnScroll className={`${styles.aboutStage} ${styles.reveal}`}>
                <AboutDecorations />
                <div className={`${styles.card} ${styles.aboutCard}`}>
                  <Bunting />
                  <p className={styles.aboutLead}>🎃 知っていますか！？</p>
                  <p>
                    <Phrases text="ペルスタでは、ほかの|ユーザーさんが|作った|プロンプトを|使って、自分の|「うちの子」の|イラストを|生成できるんです！✨" />
                  </p>
                  <p>
                    これが{" "}
                    <span className={styles.catalogWord}>
                      <strong>「カタログ化」</strong>！
                    </span>
                    <br />
                    <strong className={styles.markOrange}>
                      <Phrases text="作成した|プロンプトは|非公開のまま、|みんなに|利用して|もらえます！🙌" />
                    </strong>
                  </p>
                  <p>
                    👉{" "}
                    <Link href="/use-prompts" className={styles.textLink}>
                      作成者のメリットはこちら
                    </Link>
                  </p>
                  <p>
                    今回のテーマは{" "}
                    <span className={styles.nowrap}>
                      <strong className={styles.keyWord}>「ハロウィン」</strong> 🎃
                    </span>
                  </p>
                  <p>
                    <Phrases text="とっておきの|「ベストショット」を|" />
                    <span className={styles.nowrap}>
                      <strong className={styles.keyWord}>カタログ化</strong>して
                    </span>
                    <Phrases text="|みんなに|使って|もらおう！✨" />
                  </p>
                  <p>
                    🏆{" "}
                    <strong className={styles.markYellow}>
                      <Phrases text="選ばれた方には|Amazonギフトカードを|プレゼント！ 🎁" />
                    </strong>
                  </p>
                  <p>
                    さらに、
                    <strong className={styles.markPurple}>
                      <Phrases text="カタログを|使って|生成した|方にも|当たる|チャンス！🎉" />
                    </strong>
                  </p>
                  <p>
                    <Phrases text="作る人も、|使う人も|楽しめる|ハロウィン企画です！ 🎃" />
                  </p>
                </div>
              </RevealOnScroll>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="hbs-prize">
            <div className={styles.wrap}>
              <div id="hbs-prize">
                <Ribbon en="PRIZE">賞品</Ribbon>
              </div>
              <RevealOnScroll className={styles.reveal}>
                <PrizeCategoryHeading category={CAMPAIGN.prizeCategories.creative} count={CAMPAIGN.prizes.length} />
                <AwardList prizes={CAMPAIGN.prizes} testId="halloween-prize" />
                <PrizeCategoryHeading category={CAMPAIGN.prizeCategories.enjoy} count={CAMPAIGN.userPrizes.length} />
                <AwardList prizes={CAMPAIGN.userPrizes} testId="halloween-user-prize" />
              </RevealOnScroll>
              <div className={styles.prizeNotes}>
                {/* 2026-10-16 ユーザー指示: 「※」の注意(対象の方・購入不要・Amazon.co.jp 専用・ペルコインの有効期限・
                    両方には当選しない・抽選はエントリーした人・1人1アカウント)は応募規約に書いてあるので、ここには並べずリンクだけ */}
                <Link href={CAMPAIGN.termsPath} className={styles.termsLink}>
                  応募規約・注意事項を見る
                </Link>
              </div>
            </div>
          </section>

          {/* 終わったあとは参加できないので、参加方法は区画ごと出さない(2026-11-01 ユーザー指示) */}
          {ended ? null : (
            <section className={styles.section} aria-labelledby="hbs-join">
              <div className={styles.wrap}>
                <div id="hbs-join">
                  <Ribbon en="HOW TO JOIN">参加方法</Ribbon>
                </div>
                <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
                  <JoinTabs
                    tabs={[
                      {
                        key: "creator",
                        eventName: CAMPAIGN_EVENTS.tabCreative,
                        icon: CAMPAIGN.prizeCategories.creative.icon,
                        label: <CategoryTabLabel name={CAMPAIGN.prizeCategories.creative.name} />,
                        panel: (
                          <>
                            <JoinSummary
                              button="カタログをつくる"
                              note="投稿のときに、このハッシュタグを付けてね"
                              hashtag
                            />
                            <JoinDetails eventName={CAMPAIGN_EVENTS.stepsCreative}>
                              <StepList steps={CREATOR_STEPS} role="creator" worksHref={worksHref} />
                              <p className={styles.note}>※ 生成と投稿には、ログインが必要です</p>
                            </JoinDetails>
                            {/* 審査のポイントは作成手順ではないので、閉じずに見せる */}
                            <JudgePoints />
                          </>
                        ),
                      },
                      {
                        key: ENJOY_JOIN_TAB_KEY,
                        eventName: CAMPAIGN_EVENTS.tabEnjoy,
                        icon: CAMPAIGN.prizeCategories.enjoy.icon,
                        label: <CategoryTabLabel name={CAMPAIGN.prizeCategories.enjoy.name} />,
                        panel: (
                          <>
                            <JoinSummary
                              button="カタログから生成する"
                              note="抽選の対象になるには、下の「エントリーする」が必要です"
                            />
                            {/* エントリーは抽選に欠かせないので、閉じた手順の外に出す */}
                            <div className={styles.stepEntry} id="hbs-entry">
                              <EntryProgressCard />
                            </div>
                            <JoinDetails eventName={CAMPAIGN_EVENTS.stepsEnjoy} tabKey={ENJOY_JOIN_TAB_KEY}>
                              <StepList steps={USER_STEPS} role="user" worksHref={worksHref} />
                              <p className={styles.note}>※ 生成と投稿には、ログインが必要です</p>
                              <p className={styles.note}>※ 抽選はエントリーした人が対象です(エントリー前の投稿も数えます)</p>
                              <p className={styles.note}>※ 同じ対象作品は、何回使っても1作品と数えます</p>
                              <p className={styles.note}>※ 自分の対象作品を使った投稿は数えません</p>
                              <p className={styles.note}>
                                ※ 「このカタログで生成する」から使った投稿が対象です(プロンプトをコピーして貼り付けたものは数えません)
                              </p>
                            </JoinDetails>
                          </>
                        ),
                      },
                    ]}
                  />
                </RevealOnScroll>
              </div>
            </section>
          )}

          <section className={styles.section} aria-labelledby="hbs-schedule">
            <div className={styles.wrap}>
              <div id="hbs-schedule">
                <Ribbon en="SCHEDULE">スケジュール</Ribbon>
              </div>
              <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
                <ol className={styles.timeline}>
                  <li className={styles.timelineItem}>
                    <span className={styles.when}>{CAMPAIGN.startLabel}</span>
                    <span className={styles.what}>募集スタート</span>
                  </li>
                  <li className={styles.timelineItem}>
                    <span className={styles.when}>{CAMPAIGN.endLabel}</span>
                    <span className={styles.what}>募集締め切り</span>
                  </li>
                  <li className={styles.timelineItem}>
                    <span className={styles.when}>{CAMPAIGN.announceLabel}</span>
                    <span className={styles.what}>結果発表（特設ページで作品とクリエイターをご紹介）</span>
                  </li>
                  {/* 当選後の流れ(2026-10-16 ユーザー指示: 詳細は書かず簡易的に)。フォームや期限などは応募規約の06とお知らせに書く。
                      スマホ幅で「お知ら／せ」「お送り／します」と語の途中で折れないよう、文節の切れ目でだけ折り返す */}
                  <li className={styles.timelineItem}>
                    <span className={styles.when}>結果発表のあと</span>
                    <span className={styles.what}>
                      <Phrases text="当選のご連絡|（ペルスタ内の|お知らせで|お送りします）" />
                    </span>
                  </li>
                  <li className={styles.timelineItem}>
                    <span className={styles.when}>ご連絡のあと</span>
                    <span className={styles.what}>賞品のお届け</span>
                  </li>
                </ol>
              </RevealOnScroll>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="hbs-more">
            <div className={styles.wrap}>
              <div id="hbs-more">
                <Ribbon en="MORE">その他</Ribbon>
              </div>
              <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
                <div className={styles.points}>
                  {MORE_TIPS.map((tip) => (
                    <div key={tip.text} className={styles.point} data-testid="halloween-more-tip">
                      <span aria-hidden="true">{tip.icon}</span>
                      <span>{tip.text}</span>
                    </div>
                  ))}
                </div>
              </RevealOnScroll>
            </div>
          </section>

          <section className={styles.closing} aria-labelledby="hbs-closing">
            <Wave className={styles.waveTop} />
            <div className={`${styles.closingEn} ${styles.en}`} aria-hidden="true">
              Trick or Create!
            </div>
            <h2 id="hbs-closing" className={styles.closingTitle}>
              {ended ? <Phrases text={THANKS_PHRASES} /> : "あなたのベストショット、待ってます"}
            </h2>
            <p className={styles.closingTag}>{CAMPAIGN.hashtag}</p>
            {/* Amazonギフトカードの注意事項(2026-10-16): 応募規約へのリンクと、決まった注記2つ */}
            <div className={styles.legal}>
              <Link href={CAMPAIGN.termsPath} className={styles.legalLink}>
                応募規約・注意事項
              </Link>
              <AmazonGiftCardNotice className={styles.legalNotice} linkClassName={styles.legalLink} />
            </div>
            {/* 浮いたボタンの高さぶん空けて、いちばん下の注記が隠れないようにする。
                ここが画面に入ったら浮いたボタンを消す(下はサイト共通の案内なので重ならないように)。
                終わったあとは浮いたボタンを出さないので、空けない */}
            {ended ? null : (
              <div id={HALLOWEEN_PAGE_END_ID} className={styles.floatingCtaSpacer} aria-hidden="true" />
            )}
          </section>
        </EntryStateScope>
      </main>
      {/* 「カタログから生成する」は、みんなのカタログの企画のタブへ(2026-10-16 ユーザー指示。ハッシュタグの検索ではなく)。
          終わったあとは参加できないので出さない(2026-11-01 ユーザー指示) */}
      {ended ? null : <FloatingJoinButtons joinHref={CAMPAIGN.joinHref} worksHref={CAMPAIGN.catalogHref} />}
      {/* #hbs-works などの場所つきの URL で開いたとき、描いたあとにその場所へ移る(2026-10-25) */}
      <HashTargetScroll />
      {/*
        このページに来て登録した人の流入元に、企画のキーと来た場所(X・X の広告・メタ)を残す。
        X・メタの広告は目印(utm)なしのリンクで出したため(2026-10-16)。ほかの企画ページと同じ仕組み
      */}
      <SignupSourceCapture fallbackSource={CAMPAIGN.campaignKey} appendChannel />
    </div>
  );
}

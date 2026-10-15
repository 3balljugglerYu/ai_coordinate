import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { AnnotatedShot, type ShotBox, type ShotCallout } from "@/features/guide/components/AnnotatedShot";
import type { CampaignSubmissionItem } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";
import styles from "../halloween.module.css";
import { CopyHashtagButton } from "./CopyHashtagButton";
import { EntryProgressCard } from "./EntryProgressCard";
import { Bunting, HeroDecorations, Wave } from "./HalloweenDecorations";
import { HeroGallery } from "./HeroGallery";
import { JoinTabs } from "./JoinTabs";
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
 * 呼び名はユーザーの文と同じ「Amazonギフトカード」にそろえる。賞品の見出しは「つくる側の賞」「つかう側の賞」
 * (参加方法のタブは人を指すので「つくる人」「つかう人」のまま)。
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

function JoinButtons({ worksHref }: { worksHref: string }) {
  return (
    <div className={styles.ctaRow}>
      <Link className={styles.cta} href={CAMPAIGN.joinHref}>
        CREATEで参加する
        <span className={styles.ctaArrow} aria-hidden="true">
          →
        </span>
      </Link>
      <WorksLink className={styles.ctaSub} href={worksHref}>
        対象作品をつかう
        <span className={styles.ctaArrow} aria-hidden="true">
          →
        </span>
      </WorksLink>
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
  /** エントリー(つかう人の抽選の進捗カード)をこの手順の中に出す */
  entryCard?: boolean;
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
      src: "/campaigns/halloween-best-shot/join-8-post-form-v2.jpg",
      alt: "画像を投稿する画面。1 キャプションの欄、2 生成前の画像も表示するのチェック、3 投稿するのボタンを赤い枠で囲んでいる",
      width: 780,
      height: 866,
      rings: [
        { left: 3.3, top: 53.2, width: 93.4, height: 24.4 },
        { left: 2.3, top: 85.6, width: 45, height: 6.2 },
        { left: 75, top: 1.4, width: 21.5, height: 8.4 },
      ],
      callouts: [
        { left: 88.5, top: 49.3, text: "1", pointer: "none" },
        { left: 48.5, top: 84.2, text: "2", pointer: "none" },
        { left: 66.5, top: 3, text: "3", pointer: "none" },
      ],
    },
  },
  {
    title: "完了！",
    text: "投稿したイラストは「みんなのカタログ」に並びます。ほかの人もあなたのプロンプトで、自分の子のハロウィンをつくれます。",
  },
];

// つかう人の画面は、プロンプト利用の案内(/use-prompts)の実画面を使う。
const USE_IMG = "/use-prompts";

/** つかう人(応募作のプロンプトで生成して投稿する人)の手順 */
const USER_STEPS: readonly JoinStep[] = [
  {
    title: "エントリーする",
    text: "下の「エントリーする」をタップします。",
    entryCard: true,
  },
  {
    title: "対象作品をさがす",
    text: `期間中に「${CAMPAIGN.hashtag}」のタグを付けて投稿された作品が、キャンペーン対象作品です。下の「対象作品を見る」から、まとめて見られます。`,
    entriesLink: true,
  },
  {
    title: "「このカタログで生成する」をタップ",
    text: "使いたい対象作品の下にあるボタンをタップします。フォローしていない人の対象作品では「フォローして生成する」と出るので、そのままタップすればOKです。",
    shot: {
      src: `${USE_IMG}/step2-sub.webp`,
      alt: "対象作品の下に出る「このプロンプトで生成してみる」の枠。「フォローして生成する」のボタンを赤い枠で囲んでいる",
      width: 640,
      height: 495,
      rings: [{ left: 5.5, top: 63, width: 47, height: 12.5 }],
      callouts: [{ left: 56, top: 66, text: "ここをタップ", pointer: "none" }],
    },
  },
  {
    title: "うちの子の画像を入れて生成",
    text: "うちの子の画像を選んで「コーデ開始！」をタップします。プロンプトの中身が伏せられていても大丈夫。文字入力の欄がある対象作品なら、好きな文字も入れられます。",
    shot: {
      src: `${USE_IMG}/step3-sub.webp`,
      alt: "生成の画面。人物画像をアップロードする欄に、うちの子の画像が入っている",
      width: 560,
      height: 921,
      rings: [{ left: 4, top: 6.5, width: 92, height: 34 }],
      callouts: [{ left: 50, top: 1, text: "うちの子の画像", pointer: "down" }],
    },
  },
  {
    title: "できあがったら「投稿」をタップ",
    text: "サムネイルをタップして画像を開き、上にある「＋ 投稿」をタップします。",
    shot: POST_SHOT,
  },
  {
    title: "投稿してペルコインもGET！",
    text: "キャプションは自由に書いてOK。対象作品から生成した投稿は、ハッシュタグを付けなくても自動で数えます。その日はじめてプロンプトを使って投稿すると、ミッションのペルコインも届きます。",
    shot: {
      src: `${USE_IMG}/step4-sub.webp`,
      alt: "投稿したあとに出る「ミッションクリア！ プロンプトを利用して投稿！ ＋20ペルコイン」のお知らせ",
      width: 640,
      height: 390,
      rings: [],
      callouts: [],
    },
  },
  {
    title: "ちがう対象作品で、口数アップ！",
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
            <h3 className={styles.stepTitle}>{step.title}</h3>
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
          {step.entryCard ? (
            <div className={styles.stepEntry} id="hbs-entry">
              <EntryProgressCard />
            </div>
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

export function HalloweenBestShotPage({
  submissionPages = [],
}: {
  /** キャンペーン対象の投稿(6件ずつのページ)。空なら区画ごと出さない */
  submissionPages?: readonly CampaignSubmissionItem[][];
}) {
  const worksHref = submissionPages.length > 0 ? WORKS_ANCHOR : CAMPAIGN.entriesHref;
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
              あなたの“うちの子”が一番かがやくハロウィンをペルスタに投稿してアマギフをGETしよう！
            </p>
            <div className={styles.period}>
              <span className={styles.periodLabel}>開催期間</span>
              <span className={styles.periodDates}>
                {CAMPAIGN.startLabel} 〜 {CAMPAIGN.endLabel}
              </span>
              <span className={styles.periodNote}>結果発表：{CAMPAIGN.announceLabel}</span>
            </div>
            <JoinButtons worksHref={worksHref} />
          </div>
          <HeroGallery />
        </div>
        <Wave className={styles.wave} />
      </header>

      <main>
        {submissionPages.length > 0 ? (
          <section className={styles.section} aria-labelledby="hbs-works">
            <div className={styles.wrap}>
              <div id="hbs-works">
                <Ribbon en="WORKS">キャンペーン対象作品</Ribbon>
              </div>
              <p className={styles.worksLead}>タップして、うちの子で生成してみよう！</p>
              <RevealOnScroll className={styles.reveal}>
                <SubmissionCarousel pages={submissionPages} />
              </RevealOnScroll>
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="hbs-about">
          <div className={styles.wrap}>
            <div id="hbs-about">
              <Ribbon en="ABOUT">企画について</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <Bunting />
              <p className={styles.aboutLead}>🎃 知っていますか！？</p>
              <p>
                ペルスタでは、ほかのユーザーが作成したプロンプトを使って、
                <strong>自分の「うちの子」のイラストを生成できるんです！</strong>✨
              </p>
              <p>もちろん、プロンプトの内容は非公開のままなので、安心して公開・利用できます！🙌</p>
              <p>
                👉{" "}
                <Link href="/use-prompts" className={styles.textLink}>
                  プロンプト作成者のメリットはこちら
                </Link>
              </p>
              <p>
                今回のテーマは <strong>「ハロウィン」</strong> 🎃
              </p>
              <p>
                あなたが思い描く、とっておきの「ベストショット」を生み出すプロンプトを作成して、投稿してください！
              </p>
              <p>
                🏆 <strong>選ばれた方には、Amazonギフトカードをプレゼント！</strong> 🎁
              </p>
              <p>
                さらに！プロンプトを使ってイラストを生成してくれた方にも、
                <strong>Amazonギフトカードが当たるチャンス！</strong> 🎉
              </p>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="hbs-prize">
          <div className={styles.wrap}>
            <div id="hbs-prize">
              <Ribbon en="PRIZE">賞品</Ribbon>
            </div>
            <RevealOnScroll className={styles.reveal}>
              <h3 className={styles.prizeGroup}>
                <span aria-hidden="true">🪄</span> つくる側の賞<small>（審査）</small>
              </h3>
              <AwardList prizes={CAMPAIGN.prizes} testId="halloween-prize" />
              <h3 className={styles.prizeGroup}>
                <span aria-hidden="true">🍬</span> つかう側の賞<small>（抽選）</small>
              </h3>
              <AwardList prizes={CAMPAIGN.userPrizes} testId="halloween-user-prize" />
              <div className={styles.ticketBox}>
                <p className={styles.ticketLead}>ちがう対象作品を使うほど、当たりやすく！(最大3口)</p>
                <TicketTable />
              </div>
            </RevealOnScroll>
            <div className={styles.prizeNotes}>
              <p className={styles.note}>※ ペルコインには有効期限があります</p>
              <p className={styles.note}>※ つくる側の賞とつかう側の賞の、両方には当選しません</p>
              <p className={styles.note}>※ つかう側の賞は、エントリーした人の中から抽選します</p>
              <p className={styles.note}>※ 1人1アカウントでご参加ください。不正な参加は対象外です</p>
            </div>
          </div>
        </section>

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
                    icon: "🪄",
                    label: "つくる人",
                    sub: "プロンプトを応募",
                    panel: (
                      <>
                        <StepList steps={CREATOR_STEPS} role="creator" worksHref={worksHref} />
                        <p className={styles.note}>※ 生成と投稿には、ログインが必要です</p>
                        <JudgePoints />
                      </>
                    ),
                  },
                  {
                    key: "user",
                    icon: "🍬",
                    label: "つかう人",
                    sub: "対象作品で生成して投稿",
                    panel: (
                      <>
                        <StepList steps={USER_STEPS} role="user" worksHref={worksHref} />
                        <p className={styles.note}>※ 生成と投稿には、ログインが必要です</p>
                        <p className={styles.note}>※ 抽選はエントリーした人が対象です(エントリー前の投稿も数えます)</p>
                        <p className={styles.note}>※ 同じ対象作品は、何回使っても1作品と数えます</p>
                        <p className={styles.note}>※ 自分の対象作品を使った投稿は数えません</p>
                        <p className={styles.note}>
                          ※ 「このカタログで生成する」から使った投稿が対象です(プロンプトをコピーして貼り付けたものは数えません)
                        </p>
                      </>
                    ),
                  },
                ]}
              />
            </RevealOnScroll>
          </div>
        </section>

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
            あなたのベストショット、待ってます
          </h2>
          <p className={styles.closingTag}>{CAMPAIGN.hashtag}</p>
          <JoinButtons worksHref={worksHref} />
        </section>
      </main>
    </div>
  );
}

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { SignupSourceCapture } from "@/features/auth/components/SignupSourceCapture";
import { AnnotatedShot, type ShotBox, type ShotCallout } from "@/features/guide/components/AnnotatedShot";
import type { CampaignSubmissionItem } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { RevealOnScroll } from "@/features/campaigns/halloween/components/RevealOnScroll";
import { CAMPAIGN_EVENTS } from "@/features/campaigns/lib/campaign-events";
import { AUTUMN_MOMENT as CAMPAIGN } from "../autumn-moment";
import styles from "../autumn-moment.module.css";
import { AmazonGiftCardNotice } from "./AmazonGiftCardNotice";
import { CopyHashtagButton } from "./CopyHashtagButton";
import { FloatingJoinButtons, AUTUMN_MOMENT_PAGE_END_ID } from "./FloatingJoinButtons";
import { HashTargetScroll } from "./HashTargetScroll";
import { JoinDetails } from "./JoinDetails";
import { HeroDecorations, Wave } from "./AutumnMomentDecorations";
import { PhaseNotice } from "./PhaseNotice";
import { SubmissionCarousel } from "./SubmissionCarousel";
import { WorksAnchor } from "./WorksAnchor";

/**
 * 11月の企画「うちの子の秋のひととき」のページ(2026-10-30。10/31 にテーマを決めポーズから変更)。
 *
 * 作りはハロウィン企画のページ(features/campaigns/halloween)を写したもの。ハロウィンの部品は
 * 10/31 まで本番で動いているので触らずに写し、クリスマスの企画の前に共通の部品へまとめる。
 *
 * ハロウィンとのちがい(2026-10-30 ユーザー決定):
 * - 部門は1つ(つくる人の賞だけ)。生成した人への賞はないので、エントリー・口数・お祝いはない
 * - 応募期間のあとに生成期間がある(気に入った応募作品で生成して楽しむ期間)
 * - ⭐賞は運営が選ぶ。11/1〜11/22 の生成数・いいね・コメントなどを総合して決める(2026-10-31 ユーザー決定)。
 *   「投票」「票」「いちばん使われた」とは書かない
 * - 期間で変わるところ(いまの段階のお知らせ・浮いたボタン)は、ブラウザの時刻で出し分ける
 *   (ページはサーバーで前もって描くので、描くときに時刻を読まない)
 *
 * 画面での呼び名: 投稿された作品は「応募作品」、応募のあとの期間は「生成期間」。
 * コードと DB では、ハロウィンと同じく応募作(submissions)と呼ぶ。
 */

function Ribbon({ en, children }: { en: string; children: string }) {
  return (
    <h2 className={styles.ribbon}>
      <span className={`${styles.ribbonEn} ${styles.en}`}>{en}</span>
      {children}
    </h2>
  );
}

const WORKS_ANCHOR = "#am-works";

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

/** 文節の切れ目(「|」)でだけ折り返す。「|」は画面に出さない */
function Phrases({ text }: { text: string }) {
  return text.split("|").map((chunk, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {chunk ? <span className={styles.nowrap}>{chunk}</span> : null}
    </Fragment>
  ));
}

/** 期間「11/1(日) 0:00 〜 11/15(日) 23:59」。狭い幅では「〜」のあとでだけ折り返す(日時の途中で折らない) */
function PeriodRange({ from, to }: { from: string; to: string }) {
  return (
    <>
      <span className={styles.nowrap}>{from} 〜</span>
      <wbr /> <span className={styles.nowrap}>{to}</span>
    </>
  );
}

/** 参加のしかたのひとこと(いきなり手順を見せず、まずひとことで伝える。ハロウィンと同じ) */
function JoinSummary({ lead, note, hashtag = false }: { lead: ReactNode; note: string; hashtag?: boolean }) {
  return (
    <div className={styles.joinSummary} data-testid="autumn-moment-join-summary">
      <p className={styles.joinSummaryText}>{lead}</p>
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
  /** プロンプトの例 */
  example?: string;
  hashtag?: boolean;
  /** 応募作品へのボタン */
  worksLink?: boolean;
}

// 画面のスクショは、ハロウィン企画と同じくガチャの紹介ページ(/guide/gacha)の実画面と、
// ハロウィン企画で使ったテーマのない画面を使う。枠の位置は画像に対する割合(%)
const GUIDE_IMG = "/guide/gacha";
const IMG_DIR = "/campaigns/autumn-moment";

/**
 * プロンプトの例(場所・していること・秋の小物を書く)。髪や顔を書かなければ、
 * 使う人の子はそのままの姿で、同じ秋のひとときを過ごせる
 */
const AUTUMN_PROMPT_EXAMPLE =
  "【シーン】紅葉した公園のベンチに座り、湯気の立つ焼き芋を両手で持って、ほっこり笑顔。足もとには赤や黄色の落ち葉。やわらかな夕方の光。【服装】ベージュのニットに、ブラウンのマフラー。";

/** 応募する人(秋のひとときのプロンプトを作って投稿する人)の手順 */
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
      src: `${IMG_DIR}/join-3-image.jpg`,
      alt: "人物画像をアップロードする欄に、うちの子の画像が入っている",
      width: 780,
      height: 700,
      rings: [{ left: 9, top: 21, width: 82, height: 63 }],
      callouts: [{ left: 50, top: -6, text: "うちの子の画像", pointer: "down" }],
    },
  },
  {
    title: "秋のひとときのプロンプトを書く",
    text: "「生成したい内容」に、うちの子が過ごす秋のひとときを自由に書きます。場所・していること・秋の小物を書くのがおすすめ。髪や顔のことを書かなければ、使う人の子もそのままの姿で楽しめます。",
    example: AUTUMN_PROMPT_EXAMPLE,
  },
  {
    title: "「コーデ開始！」で生成する",
    text: "うちの子の秋のひとときのイラストができあがります。",
    shot: {
      src: `${IMG_DIR}/join-5-generate.jpg`,
      alt: "生成の設定と、いちばん下のコーデ開始！のボタン",
      width: 780,
      height: 736,
      rings: [{ left: 9, top: 83.5, width: 82, height: 15 }],
      callouts: [{ left: 20, top: 100.5, text: "ここをタップ", pointer: "up" }],
    },
  },
  {
    title: "できあがったら、サムネイルをタップ",
    text: "生成されたイラストの小さな画像(サムネイル)をタップして開き、上にある「＋ 投稿」をタップします。",
  },
  {
    title: "説明とハッシュタグを付けて投稿！",
    text: "投稿の画面で、次の3つをします。",
    points: [
      "「キャプション」に、イラストの説明とハッシュタグを入れる(タグ候補をタップすると入ります)",
      "「生成前の画像も表示する」にチェックを入れる",
      "「投稿する」をタップ",
    ],
    hashtag: true,
  },
  {
    title: "完了！",
    text: "投稿した作品は「みんなのカタログ」に並び、ほかの人も自分の子で使えるようになります。プロンプトは非公開のままでOKです。",
  },
];

/** 生成する人(気に入った応募作品で、うちの子を生成する人)の手順 */
const GENERATE_STEPS: readonly JoinStep[] = [
  {
    title: "応募作品をさがす",
    text: "このページの「応募作品」から、気に入った作品をタップします。",
    worksLink: true,
  },
  {
    title: "「このカタログで|生成する」|をタップ",
    text: "作品の下にあるボタンをタップします。フォローしていない人の作品では「フォローして生成する」と出るので、そのままタップすればOKです。",
  },
  {
    title: "うちの子の画像を|入れて生成",
    text: "うちの子の画像を選んで「コーデ開始！」をタップします。プロンプトの中身が伏せられていても大丈夫。",
    shot: {
      src: `${IMG_DIR}/generate-3-upload.webp`,
      alt: "生成の画面。人物画像をアップロードする欄に、うちの子の画像が入っている",
      width: 560,
      height: 921,
      rings: [{ left: 4, top: 6.5, width: 92, height: 34 }],
      callouts: [{ left: 50, top: 1, text: "うちの子の画像", pointer: "down" }],
    },
  },
  {
    title: "できあがり！",
    text: "気に入った仕上がりは、ぜひ投稿してみんなに見せてね。",
  },
];

/** 「|」は、狭い幅で折り返してよい位置(画面には出さない) */
const MORE_TIPS = [
  { icon: "📣", text: "Xに|シェアすると、|あなたの|秋のひとときを|使ってくれる人が|増えるかも！？" },
  { icon: "⏰", text: "11/1からの|生成数・|いいね・|コメントも|選考の|参考にするので、|早めの投稿が|おすすめ！" },
  { icon: "💖", text: "運営も|「いいね」などで|応援します！" },
] as const;

type Award = (typeof CAMPAIGN.prizes)[number];

/**
 * 賞の一覧(ハロウィンと同じ形。賞ごとの画像はまだ無いので、名前・ねらい・賞品と人数・説明だけ)。
 */
function AwardList({ prizes }: { prizes: readonly Award[] }) {
  return (
    <ul className={styles.awards}>
      {prizes.map((prize) => (
        <li key={prize.name} className={`${styles.award} ${styles.awardNoThumb}`} data-testid="autumn-moment-prize">
          <div className={styles.awardHead}>
            <h4 className={styles.awardName}>
              <span aria-hidden="true">{prize.icon}</span> <BreakHints text={prize.name} />
            </h4>
            <p className={styles.awardTagline}>
              <BreakHints text={prize.tagline} />
            </p>
          </div>
          <p className={styles.awardGift} data-testid="autumn-moment-prize-gift">
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
          </div>
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
  role: "creator" | "generator";
  worksHref: string;
}) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => (
        <li key={step.title} className={styles.step} data-testid={`autumn-moment-step-${role}`}>
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
          {step.example ? (
            <div className={styles.promptExample}>
              <p className={styles.promptExampleLabel}>プロンプトの例</p>
              <p className={styles.promptExampleText}>{step.example}</p>
            </div>
          ) : null}
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
          {step.worksLink ? (
            <WorksAnchor className={styles.entriesLink} href={worksHref}>
              応募作品を見る
              <span aria-hidden="true">→</span>
            </WorksAnchor>
          ) : null}
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

/** 応募作品の数(ページに分けた一覧の件数の合計) */
function countWorks(pages: readonly (readonly CampaignSubmissionItem[])[]): number {
  return pages.reduce((total, page) => total + page.length, 0);
}

export function AutumnMomentPage({
  submissionPages = [],
}: {
  /** 応募作品(9件ずつのページ)。空なら区画ごと出さない */
  submissionPages?: readonly CampaignSubmissionItem[][];
}) {
  const worksHref = submissionPages.length > 0 ? WORKS_ANCHOR : CAMPAIGN.entriesHref;
  return (
    <div className={styles.page} data-testid="autumn-moment">
      <header className={styles.hero}>
        <HeroDecorations />
        <div className={`${styles.heroInner} ${styles.heroInnerSingle}`}>
          <div className={styles.heroText}>
            <div className={styles.chips}>
              <span className={`${styles.chip} ${styles.chipHot}`}>🍁 11月の企画</span>
              <span className={styles.chip}>{CAMPAIGN.prizeTotalLabel}</span>
            </div>
            <h1 className={styles.title}>
              <span className={styles.titleJp}>
                うちの子の
                <br />
                秋のひととき
              </span>
              <span className={`${styles.titleEn} ${styles.en}`}>
                Autumn <span className={styles.magic}>Moments</span>
              </span>
            </h1>
            <p className={styles.lead}>
              あなたの“うちの子”が過ごす、とっておきの秋のひとときを大募集！
              <span className={styles.nowrap}>{CAMPAIGN.prizes[0].name}には、</span>
              <wbr />
              <span className={styles.nowrap}>{CAMPAIGN.prizeTotalLabel}を</span>
              <wbr />
              <span className={styles.nowrap}>プレゼント！</span>
            </p>
            <dl className={styles.periods}>
              <div className={styles.periodRow}>
                <dt className={styles.periodLabel}>応募期間</dt>
                <dd className={styles.periodDates}>
                  <PeriodRange from={CAMPAIGN.submitStartLabel} to={CAMPAIGN.submitEndLabel} />
                </dd>
              </div>
              <div className={styles.periodRow}>
                <dt className={styles.periodLabel}>生成期間</dt>
                <dd className={styles.periodDates}>
                  <PeriodRange from={CAMPAIGN.generateStartLabel} to={CAMPAIGN.generateEndLabel} />
                </dd>
              </div>
              <div className={styles.periodRow}>
                <dt className={styles.periodLabel}>結果発表</dt>
                <dd className={styles.periodDates}>{CAMPAIGN.announceLabel}</dd>
              </div>
            </dl>
            <PhaseNotice />
          </div>
        </div>
        <Wave className={styles.wave} />
      </header>

      <main>
        {submissionPages.length > 0 ? (
          <section className={`${styles.section} ${styles.worksSection}`} aria-labelledby="am-works">
            <div className={styles.wrap}>
              <div id="am-works">
                <Ribbon en="WORKS">応募作品</Ribbon>
              </div>
              <p className={styles.worksLead}>気に入った作品をタップして、うちの子で生成してみよう！</p>
              <p className={styles.worksTotal} data-testid="autumn-moment-works-count">
                現在、応募作品は<strong className={styles.worksTotalNumber}>{countWorks(submissionPages)}</strong>
                作品！
              </p>
              <RevealOnScroll className={styles.reveal}>
                <SubmissionCarousel pages={submissionPages} />
              </RevealOnScroll>
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="am-about">
          <div className={styles.wrap}>
            <div id="am-about">
              <Ribbon en="ABOUT">企画について</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.aboutStage} ${styles.reveal}`}>
              <div className={`${styles.card} ${styles.aboutCard}`}>
                <p className={styles.aboutLead}>
                  <Phrases text="🍁 今回の|テーマは|「秋のひととき」！" />
                </p>
                <p>
                  <Phrases text="紅葉狩り、|焼き芋、|読書の秋、|お月見、|カフェで|ひと休み、|落ち葉の|じゅうたんで|おさんぽ…" />
                </p>
                <p>
                  <strong className={styles.markOrange}>
                    <Phrases text="うちの子が|過ごす|“とっておき”の|秋のひとときを、|CREATEで|作って|投稿しよう！" />
                  </strong>
                </p>
                <p>
                  <Phrases text="投稿した|作品は|" />
                  <span className={styles.catalogWord}>
                    <strong>「カタログ化」</strong>
                  </span>
                  <Phrases text="されて、|みんなが|自分の|うちの子で|使えます。|プロンプトは|非公開のままでOK！🙌" />
                </p>
                <p>
                  👉{" "}
                  <Link href="/use-prompts" className={styles.textLink}>
                    作成者のメリットはこちら
                  </Link>
                </p>
                <p>
                  🍂{" "}
                  <strong className={styles.markPurple}>
                    <Phrases text="気に入った|作品で、|うちの子を|生成しよう！" />
                  </strong>
                  <br />
                  <Phrases text={`応募期間中から、|生成期間の|終わり（${CAMPAIGN.generateEndLabel}）まで|楽しめます。`} />
                </p>
                <p>
                  🏆{" "}
                  <strong className={styles.markYellow}>
                    <Phrases text={`${CAMPAIGN.prizes[0].name}には、|${CAMPAIGN.prizeTotalLabel.replace(" ", "|")}を|プレゼント！🎁`} />
                  </strong>
                  <br />
                  <Phrases text="生成数・|いいね・|コメントなどを|総合して、|運営が|選びます。" />
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="am-join">
          <div className={styles.wrap}>
            <div id="am-join">
              <Ribbon en="HOW TO JOIN">応募のしかた</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <p className={styles.sectionPeriod}>
                応募期間：{CAMPAIGN.submitStartLabel} 〜 {CAMPAIGN.submitEndLabel}
              </p>
              <JoinSummary
                lead={
                  <>
                    <span className={styles.nowrap}>
                      <strong className={styles.keyWord}>「カタログをつくる」</strong>から
                    </span>
                    <Phrases text="生成して|投稿するだけで|OK！" />
                  </>
                }
                note="投稿のときに、このハッシュタグを付けてね"
                hashtag
              />
              <JoinDetails eventName={CAMPAIGN_EVENTS.stepsCreative} summary="詳しい作成手順はこちら！">
                <StepList steps={CREATOR_STEPS} role="creator" worksHref={worksHref} />
                <p className={styles.note}>※ 生成と投稿には、ログインが必要です</p>
                <p className={styles.note}>※ ほかの人のカタログから作った作品は、応募作品になりません</p>
              </JoinDetails>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="am-generate">
          <div className={styles.wrap}>
            <div id="am-generate">
              <Ribbon en="HOW TO ENJOY">生成期間の楽しみ方</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <p className={styles.sectionPeriod}>
                生成期間：{CAMPAIGN.generateStartLabel} 〜 {CAMPAIGN.generateEndLabel}
              </p>
              <JoinSummary
                lead={
                  <>
                    <span className={styles.nowrap}>
                      <strong className={styles.keyWord}>「このカタログで生成する」</strong>から
                    </span>
                    <Phrases text="うちの子で|生成しよう！" />
                  </>
                }
                note="応募期間中から、いつでも生成できます"
              />
              <JoinDetails eventName={CAMPAIGN_EVENTS.stepsGenerate} summary="詳しい生成のしかたはこちら！">
                <StepList steps={GENERATE_STEPS} role="generator" worksHref={worksHref} />
                <p className={styles.note}>※ 生成には、ログインとペルコインが必要です</p>
              </JoinDetails>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="am-prize">
          <div className={styles.wrap}>
            <div id="am-prize">
              <Ribbon en="PRIZE">賞品</Ribbon>
            </div>
            <RevealOnScroll className={styles.reveal}>
              <p className={styles.prizeGroupLead}>
                <Phrases text="11/1〜11/22 の|生成数・|いいね・|コメントなどを|総合して、|運営が|選びます！" />
              </p>
              <AwardList prizes={CAMPAIGN.prizes} />
            </RevealOnScroll>
            <div className={styles.prizeNotes}>
              <Link href={CAMPAIGN.termsPath} className={styles.termsLink}>
                応募規約・注意事項を見る
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="am-schedule">
          <div className={styles.wrap}>
            <div id="am-schedule">
              <Ribbon en="SCHEDULE">スケジュール</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <ol className={styles.timeline}>
                <li className={styles.timelineItem}>
                  <span className={styles.when}>{CAMPAIGN.submitStartLabel}</span>
                  <span className={styles.what}>応募スタート</span>
                </li>
                <li className={styles.timelineItem}>
                  <span className={styles.when}>{CAMPAIGN.submitEndLabel}</span>
                  <span className={styles.what}>応募締め切り</span>
                </li>
                <li className={styles.timelineItem}>
                  <span className={styles.when}>{CAMPAIGN.generateStartLabel}</span>
                  <span className={styles.what}>生成期間スタート</span>
                </li>
                <li className={styles.timelineItem}>
                  <span className={styles.when}>{CAMPAIGN.generateEndLabel}</span>
                  <span className={styles.what}>生成期間おわり</span>
                </li>
                <li className={styles.timelineItem}>
                  <span className={styles.when}>{CAMPAIGN.announceLabel}</span>
                  <span className={styles.what}>結果発表（特設ページで作品とクリエイターをご紹介）</span>
                </li>
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

        <section className={styles.section} aria-labelledby="am-more">
          <div className={styles.wrap}>
            <div id="am-more">
              <Ribbon en="MORE">その他</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <div className={styles.points}>
                {MORE_TIPS.map((tip) => (
                  <div key={tip.text} className={styles.point} data-testid="autumn-moment-more-tip">
                    <span aria-hidden="true">{tip.icon}</span>
                    <span>
                      <Phrases text={tip.text} />
                    </span>
                  </div>
                ))}
              </div>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="am-closing">
          <Wave className={styles.waveTop} />
          <div className={`${styles.closingEn} ${styles.en}`} aria-hidden="true">
            Autumn Moments
          </div>
          <h2 id="am-closing" className={styles.closingTitle}>
            あなたの秋のひととき、待ってます
          </h2>
          <p className={styles.closingTag}>{CAMPAIGN.hashtag}</p>
          {/* Amazonギフトカードの注意事項: 応募規約へのリンクと、決まった注記2つ */}
          <div className={styles.legal}>
            <Link href={CAMPAIGN.termsPath} className={styles.legalLink}>
              応募規約・注意事項
            </Link>
            <AmazonGiftCardNotice className={styles.legalNotice} linkClassName={styles.legalLink} />
          </div>
          {/* 浮いたボタンの高さぶん空けて、いちばん下の注記が隠れないようにする */}
          <div id={AUTUMN_MOMENT_PAGE_END_ID} className={styles.floatingCtaSpacer} aria-hidden="true" />
        </section>
      </main>
      <FloatingJoinButtons joinHref={CAMPAIGN.joinHref} worksHref={worksHref} />
      <HashTargetScroll />
      {/* このページに来て登録した人の流入元に、企画のキーと来た場所(X・X の広告・メタ)を残す(ハロウィンと同じ) */}
      <SignupSourceCapture fallbackSource={CAMPAIGN.campaignKey} appendChannel />
    </div>
  );
}

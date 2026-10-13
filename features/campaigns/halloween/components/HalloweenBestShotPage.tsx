import Image from "next/image";
import Link from "next/link";
import { AnnotatedShot, type ShotBox, type ShotCallout } from "@/features/guide/components/AnnotatedShot";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";
import styles from "../halloween.module.css";
import { CopyHashtagButton } from "./CopyHashtagButton";
import { Bunting, HeroDecorations, Wave } from "./HalloweenDecorations";
import { RevealOnScroll } from "./RevealOnScroll";

/**
 * ハロウィン企画「うちの子のベストショット with Halloween Magic」のページ(2026-10-12)。
 * 見た目は見本(今/変更後)でユーザーが確認済み。参加は CREATE でプロンプトを作って投稿。
 */

function Ribbon({ en, children }: { en: string; children: string }) {
  return (
    <h2 className={styles.ribbon}>
      <span className={`${styles.ribbonEn} ${styles.en}`}>{en}</span>
      {children}
    </h2>
  );
}

function JoinButton() {
  return (
    <Link className={styles.cta} href={CAMPAIGN.joinHref}>
      CREATEで参加する
      <span className={styles.ctaArrow} aria-hidden="true">
        →
      </span>
    </Link>
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
}

// 画面のスクショはガチャの紹介ページ(/guide/gacha)の実画面を使う(手順3は画像、手順4はプロンプトの文、手順5はモデル名だけ差し替えた版)。枠の位置は画像に対する割合(%)。
const GUIDE_IMG = "/guide/gacha";

const STEPS: readonly JoinStep[] = [
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
    text: "「生成したい内容」に、ハロウィンの衣装・ポーズ・背景などを自由に書きます。「ガチャプロンプトにする」はオフのままにしてください。",
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
    shot: {
      src: "/campaigns/halloween-best-shot/join-7-post.jpg",
      alt: "生成した画像を大きく開いた画面。上に並ぶボタンのうち「＋ 投稿」を赤い枠で囲んでいる",
      width: 780,
      height: 1515,
      device: true,
      rings: [{ left: 60.5, top: 0.8, width: 17.5, height: 4.6 }],
      callouts: [{ left: 34, top: 8, text: "ここをタップ", pointer: "up-end" }],
    },
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

const JUDGE_POINTS = [
  { icon: "✨", name: "安定性", text: "だれの子で生成しても、イメージどおりの雰囲気や構図を再現できるか" },
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

export function HalloweenBestShotPage() {
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
            <div>
              <JoinButton />
            </div>
          </div>
          <figure className={styles.heroPhoto}>
            <Image
              src="/campaigns/halloween-best-shot/hero.jpg"
              alt="ペルスタで生成したハロウィンのイラストの例"
              fill
              priority
              sizes="(min-width: 860px) 360px, 78vw"
              style={{ objectFit: "cover" }}
            />
            <span className={styles.heroPhotoTag}>作例</span>
          </figure>
        </div>
        <Wave className={styles.wave} />
      </header>

      <main>
        <section className={styles.section} aria-labelledby="hbs-about">
          <div className={styles.wrap}>
            <div id="hbs-about">
              <Ribbon en="ABOUT">企画について</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <Bunting />
              <p className={styles.aboutLead}>知っていますか！？</p>
              <p>
                ペルスタでは、ほかのユーザーが作成したプロンプトを使って、
                <span className={styles.highlight}>自分の「うちの子」のイラストを生成できるんです！</span>✨
                <br />
                <Link href="/use-prompts" className={styles.textLink}>
                  利用特典について
                </Link>
              </p>
              <p>
                だからこそ大切なのが、だれの子で生成しても、イメージどおりに仕上がる
                <span className={styles.accent}>「安定したプロンプト」</span>。
              </p>
              <p>
                ハロウィンをテーマに、あなたが思う「ベストショット」を生み出すプロンプトを作成し、投稿してください！🎃
              </p>
              <p>
                <strong>賞に選ばれた方には、Amazonギフトカードをプレゼント！</strong>🎁
              </p>
              <p>さらに、受賞作品は特設ページでもご紹介します！✨</p>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="hbs-prize">
          <div className={styles.wrap}>
            <div id="hbs-prize">
              <Ribbon en="PRIZE">賞品</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.prizes} ${styles.reveal}`}>
              {CAMPAIGN.prizes.map((prize) => (
                <div
                  key={prize.rank}
                  className={`${styles.prize} ${prize.tone === "gold" ? styles.prizeGold : styles.prizeSilver}`}
                  data-testid="halloween-prize"
                >
                  <span className={styles.medal} aria-hidden="true">
                    {prize.medal}
                  </span>
                  <div className={styles.prizeName}>{prize.rank}</div>
                  <div className={styles.prizeAmount}>
                    {prize.amount}
                    <small>円分</small>
                  </div>
                  <span className={styles.prizeWho}>{prize.winners}</span>
                </div>
              ))}
            </RevealOnScroll>
            <p className={styles.note} style={{ textAlign: "center" }}>
              ※ Amazonギフト券でお贈りします
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="hbs-join">
          <div className={styles.wrap}>
            <div id="hbs-join">
              <Ribbon en="HOW TO JOIN">参加方法</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
              <ol className={styles.steps}>
                {STEPS.map((step, index) => (
                  <li key={step.title} className={styles.step} data-testid="halloween-join-step">
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
              <p className={styles.note}>※ 生成と投稿には、ログインが必要です</p>
              <p className={styles.note}>※ ガチャプロンプトは対象外です</p>
            </RevealOnScroll>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="hbs-point">
          <div className={styles.wrap}>
            <div id="hbs-point">
              <Ribbon en="POINT">審査のポイント</Ribbon>
            </div>
            <RevealOnScroll className={`${styles.card} ${styles.reveal}`}>
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
          <JoinButton />
        </section>
      </main>
    </div>
  );
}

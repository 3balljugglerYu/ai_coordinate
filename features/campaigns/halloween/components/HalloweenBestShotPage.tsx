import Image from "next/image";
import Link from "next/link";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";
import styles from "../halloween.module.css";
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

const STEPS = [
  { title: "CREATEでプロンプトをつくる", text: "ハロウィンをテーマに、うちの子の画像とプロンプトで生成します。" },
  { title: "ハッシュタグを付けて投稿", text: "気に入った1枚を投稿します。", hashtag: true },
  {
    title: "みんなのカタログに並ぶ",
    text: "ほかの人もあなたのプロンプトで、自分の子のハロウィンをつくれます。",
  },
] as const;

const JUDGE_POINTS = [
  { icon: "✨", name: "安定性", text: "だれの子で生成しても、After とできるだけ同じ雰囲気・構図に仕上がるか" },
  { icon: "🎃", name: "ハロウィンらしさ", text: "見た瞬間にハロウィンの魔法が伝わるか" },
  { icon: "💖", name: "うちの子らしさ", text: "その子の魅力がいちばん輝く“ベストショット”か" },
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
              <p>
                ペルスタでは、ほかの人のプロンプトを使って、
                <span className={styles.highlight}>自分のうちの子で同じイラストをつくれます</span>。
              </p>
              <p>
                だからこそ大切なのが、だれの子で生成しても After どおりに仕上がる
                <span className={styles.accent}>「安定したプロンプト」</span>。
              </p>
              <p>
                ハロウィンをテーマに、あなたの“ベストショット”なプロンプトを CREATE でつくって投稿してください。選ばれた作品は、特設ページでご紹介します！
              </p>
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
                  <li key={step.title} className={styles.step}>
                    <span className={`${styles.stepNum} ${styles.en}`} aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className={styles.stepTitle}>{step.title}</h3>
                      <p className={styles.stepText}>{step.text}</p>
                      {"hashtag" in step ? <span className={styles.hashtag}>{CAMPAIGN.hashtag}</span> : null}
                    </div>
                  </li>
                ))}
              </ol>
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
                  <div key={point.name} className={styles.point}>
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

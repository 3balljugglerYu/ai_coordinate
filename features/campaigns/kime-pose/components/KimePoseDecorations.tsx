import styles from "../kime-pose.module.css";

/**
 * 決めポーズ企画のページの飾り(すべて独自の SVG)。読み上げには不要なので aria-hidden。
 * 飾りは盛らない(2026-10-16 ユーザー指示)。冒頭の舞台のスポットライトときらめきだけ。
 */

const SPARKLES = [
  { left: "8%", top: "14%", delay: "0s" },
  { left: "22%", top: "6%", delay: ".6s" },
  { left: "46%", top: "18%", delay: "1.2s" },
  { left: "63%", top: "9%", delay: ".3s" },
  { left: "84%", top: "40%", delay: "1.8s" },
  { left: "12%", top: "58%", delay: ".9s" },
  { left: "38%", top: "70%", delay: "2.1s" },
];

/** 冒頭の舞台: 上から当たるスポットライト2本と、きらめき */
export function HeroDecorations() {
  return (
    <>
      <div className={`${styles.spotlight} ${styles.spotlightLeft}`} aria-hidden="true" />
      <div className={`${styles.spotlight} ${styles.spotlightRight}`} aria-hidden="true" />
      {SPARKLES.map((sparkle) => (
        <span
          key={`${sparkle.left}-${sparkle.top}`}
          className={styles.star}
          style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}
          aria-hidden="true"
        />
      ))}
      <svg className={styles.floatStar} style={{ right: "6%", top: "24%", width: 40 }} viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 4 24 15h11l-9 7 4 12-10-7-10 7 4-12-9-7h11z" fill="var(--gold)" />
      </svg>
    </>
  );
}

/** 帯のふちの波形(fill はページのベース色) */
export function Wave({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 24c120 22 240 22 360 0s240-22 360 0 240 22 360 0 240-22 360 0v24H0z" fill="var(--base)" />
    </svg>
  );
}

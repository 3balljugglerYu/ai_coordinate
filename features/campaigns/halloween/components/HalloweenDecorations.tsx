import type { CSSProperties } from "react";
import styles from "../halloween.module.css";

/**
 * ハロウィン企画のページの飾り(すべて独自の SVG。参考サイトの素材は使わない)。
 * 読み上げには不要なので aria-hidden。
 */

const BAT_PATH =
  "M32 14C26 4 14 2 2 8c6 2 9 6 9 11 4-3 9-3 12 1 2-4 5-6 9-6zm0 0c6-10 18-12 30-6-6 2-9 6-9 11-4-3-9-3-12 1-2-4-5-6-9-6z";

function Bat({ className, top }: { className: string; top: string }) {
  return (
    <svg className={className} style={{ top, left: 0 }} viewBox="0 0 64 32" aria-hidden="true">
      <g className={styles.batWing}>
        <path d={BAT_PATH} fill="#1a0622" />
      </g>
      <ellipse cx="32" cy="16" rx="4" ry="6" fill="#1a0622" />
    </svg>
  );
}

/** おばけ(冒頭の夜空と、企画についての枠で使う) */
function Ghost({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 60 60" aria-hidden="true">
      <path d="M30 6c-11 0-18 9-18 20v24l6-5 6 5 6-5 6 5 6-5 6 5V26C48 15 41 6 30 6z" fill="#fff" />
      <circle cx="24" cy="26" r="3.5" fill="#3d1050" />
      <circle cx="36" cy="26" r="3.5" fill="#3d1050" />
      <ellipse cx="30" cy="35" rx="4" ry="3" fill="#ff4fa3" />
    </svg>
  );
}

/** ジャック・オー・ランタン(冒頭の夜空と、企画についての枠で使う) */
function Pumpkin({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 64 56" aria-hidden="true">
      <path d="M30 6c2-5 7-6 9-4-3 1-5 3-6 6z" fill="#3e7a2b" />
      <ellipse cx="32" cy="32" rx="28" ry="22" fill="#ff7a1a" />
      <path d="M32 10c-8 0-12 10-12 22s4 22 12 22 12-10 12-22-4-22-12-22z" fill="#ff8f2e" />
      <g className={styles.pumpkinFace} fill="#ffd25a">
        <path d="M18 26l7-4 3 8zM46 26l-7-4-3 8zM18 38c8 6 20 6 28 0l-4 8-4-4-4 5-4-5-4 4z" />
      </g>
    </svg>
  );
}

const STARS = [
  { left: "8%", top: "14%", delay: "0s" },
  { left: "22%", top: "6%", delay: ".6s" },
  { left: "46%", top: "18%", delay: "1.2s" },
  { left: "63%", top: "9%", delay: ".3s" },
  { left: "84%", top: "40%", delay: "1.8s" },
  { left: "12%", top: "58%", delay: ".9s" },
  { left: "38%", top: "70%", delay: "2.1s" },
];

/** 冒頭の夜空: 月・星・コウモリ・クモ・おばけ・ジャック・オー・ランタン */
export function HeroDecorations() {
  return (
    <>
      <div className={styles.moon} aria-hidden="true" />
      {STARS.map((star) => (
        <span
          key={`${star.left}-${star.top}`}
          className={styles.star}
          style={{ left: star.left, top: star.top, animationDelay: star.delay }}
          aria-hidden="true"
        />
      ))}
      <svg className={styles.floatStar} style={{ left: "52%", top: "6%", width: 40 }} viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 4 24 15h11l-9 7 4 12-10-7-10 7 4-12-9-7h11z" fill="#ffc23d" />
      </svg>
      <Ghost className={styles.ghost} style={{ right: "5%", top: "52%" }} />
      <Bat className={styles.bat} top="10%" />
      <Bat className={`${styles.bat} ${styles.batSmall}`} top="30%" />
      <Bat className={`${styles.bat} ${styles.batMid}`} top="4%" />
      <svg className={styles.spider} style={{ right: "12%" }} viewBox="0 0 26 90" aria-hidden="true">
        <line x1="13" y1="0" x2="13" y2="62" stroke="rgba(255,255,255,.6)" strokeWidth="1" />
        <g fill="#1a0622">
          <circle cx="13" cy="70" r="7" />
          <circle cx="13" cy="62" r="4" />
          <path d="M6 66 0 60M6 70 0 70M6 74 0 80M20 66l6-6M20 70h6M20 74l6 6" stroke="#1a0622" strokeWidth="2" />
        </g>
        <circle cx="11" cy="61" r="1" fill="#fff" />
        <circle cx="15" cy="61" r="1" fill="#fff" />
      </svg>
      <Pumpkin className={styles.pumpkin} style={{ right: "4%", bottom: 52, zIndex: 2 }} />
    </>
  );
}

/** 企画についての枠の角に重ねる、おばけ(右上)とジャック・オー・ランタン(左下) */
export function AboutDecorations() {
  return (
    <>
      <Ghost className={styles.aboutGhost} />
      <Pumpkin className={styles.aboutPumpkin} />
    </>
  );
}

const BUNTING_COLORS = ["#ff7a1a", "#8a4dff", "#ff4fa3", "#ffc23d"];

/** カードの上辺の旗飾り(小さく揺れる) */
export function Bunting() {
  const flags = Array.from({ length: 12 }, (_, index) => index);
  return (
    <svg className={styles.bunting} viewBox="0 0 400 22" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 0h400" stroke="#d9c6e6" strokeWidth="2" />
      <g className={styles.buntingFlags}>
        {flags.map((index) => (
          <path
            key={index}
            d={`M${10 + index * 34} 0l12 20 12-20z`}
            fill={BUNTING_COLORS[index % BUNTING_COLORS.length]}
          />
        ))}
      </g>
    </svg>
  );
}

/** 帯のふちの波形(fill はページのベース色) */
export function Wave({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 24c120 22 240 22 360 0s240-22 360 0 240 22 360 0 240-22 360 0v24H0z" fill="#fdf3fb" />
    </svg>
  );
}

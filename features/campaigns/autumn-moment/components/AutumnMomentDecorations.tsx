import styles from "../autumn-moment.module.css";

/**
 * 秋のひととき企画のページの飾り(すべて独自の SVG)。読み上げには不要なので aria-hidden。
 * 飾りは盛らない(2026-10-16 ユーザー指示)。冒頭に、ゆっくり揺れる落ち葉を少しだけ。
 */

/** もみじの葉(40×40) */
const MAPLE_LEAF_PATH =
  "M20 2 23 10 29 7 27 15 36 14 30 21 34 25 24 25 22 31 21 38 19 38 18 31 16 25 6 25 10 21 4 14 13 15 11 7 17 10z";

const LEAVES = [
  { left: "5%", top: "10%", size: 26, color: "var(--accent-light)", delay: "0s", turn: "-18deg" },
  { left: "30%", top: "4%", size: 18, color: "var(--gold)", delay: "1.4s", turn: "12deg" },
  { left: "58%", top: "12%", size: 22, color: "var(--accent)", delay: ".7s", turn: "-8deg" },
  { right: "6%", top: "22%", size: 34, color: "var(--gold)", delay: "2.1s", turn: "20deg" },
  { right: "14%", top: "62%", size: 20, color: "var(--accent-light)", delay: "1s", turn: "-24deg" },
] as const;

/** 冒頭の飾り: ゆっくり揺れる、もみじの落ち葉 */
export function HeroDecorations() {
  return (
    <>
      {LEAVES.map((leaf) => (
        <svg
          key={`${"left" in leaf ? leaf.left : leaf.right}-${leaf.top}`}
          className={styles.leaf}
          style={{
            ...("left" in leaf ? { left: leaf.left } : { right: leaf.right }),
            top: leaf.top,
            width: leaf.size,
            animationDelay: leaf.delay,
            ["--leaf-turn" as string]: leaf.turn,
          }}
          viewBox="0 0 40 40"
          aria-hidden="true"
        >
          <path d={MAPLE_LEAF_PATH} fill={leaf.color} />
        </svg>
      ))}
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

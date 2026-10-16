import styles from "./halloween-target.module.css";

/**
 * 対象作品の見た目(2026-10-16 ユーザー指示)。ラベルと「このカタログで生成する」の色だけを持つ。
 * 色は企画ページ(halloween.module.css)の色から取る。変えるときはここと
 * halloween-target.module.css だけ直す。
 *
 * - ラベル: オレンジ(--orange → 明るいオレンジ)。3案の見本からユーザーが選んだ案A。動きはなし
 * - ボタン: 紫 → オレンジ(--violet / --orange)。3案の見本からユーザーが選んだ案Cを、
 *   「やや早めに流れる」動きにした(halloween-target.module.css)
 *
 * ボタンは普段のピンク → オレンジ(from-pink-500 to-orange-400)の代わりに使う。
 * 形・大きさ・文言は普段のボタンのまま(企画ページの手順の「このカタログで生成する」と同じ言葉)。
 */

/** 「ハロウィン企画対象！」の地と文字の色 */
export const HALLOWEEN_TARGET_BADGE_CLASS =
  "bg-gradient-to-r from-[#ff7a1a] to-[#ffb12e] text-white";

/** 対象作品の「このカタログで生成する」の地と文字の色 */
export const HALLOWEEN_TARGET_BUTTON_CLASS = `${styles.flow} text-white`;

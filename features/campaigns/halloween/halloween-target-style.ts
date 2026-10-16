import styles from "./halloween-target.module.css";

/**
 * 対象作品の見た目(2026-10-16 ユーザー指示)。ラベルと「このカタログで生成する」の色だけを持つ。
 *
 * 色は紫 → オレンジ(企画ページ halloween.module.css の --violet / --orange)。3案の見本から
 * ユーザーが選んだ案C。「やや早めに流れる」動きにした(halloween-target.module.css)。
 * 変えるときはここと halloween-target.module.css だけ直す。
 *
 * ボタンは普段のピンク → オレンジ(from-pink-500 to-orange-400)の代わりに使う。
 * 形・大きさ・文言は普段のボタンのまま(企画ページの手順の「このカタログで生成する」と同じ言葉)。
 */

/** 「🎃ハロウィン企画対象！」の地と文字の色 */
export const HALLOWEEN_TARGET_BADGE_CLASS = `${styles.flow} text-white`;

/** 対象作品の「このカタログで生成する」の地と文字の色 */
export const HALLOWEEN_TARGET_BUTTON_CLASS = `${styles.flow} text-white`;

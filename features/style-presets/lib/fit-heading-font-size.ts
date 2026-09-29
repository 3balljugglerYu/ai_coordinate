/**
 * カタログのページの見出し(h1)を1行に収める文字の大きさ(px)。
 *
 * どの言語でも見出しは1行に収める(2026-09-29 ユーザー指示)。3つのタブの見出しは
 * 同じ大きさにそろえる(タブを切り替えるたびに大きさが変わらないように)ので、
 * 3つのうち一番長い見出しが入る大きさを返す。
 *
 * @returns 縮める必要が無いとき・測れないとき(描画前・幅が 0 や NaN)は null
 *          (CSS の大きさのまま)。縮めるときは切り捨てた px(minPx より小さくしない)
 */
export function fitHeadingFontSize({
  basePx,
  minPx,
  availablePx,
  titleWidthsPx,
}: {
  /** CSS での見出しの大きさ(text-3xl = 30px) */
  basePx: number;
  /** これより小さくはしない */
  minPx: number;
  /** 見出しに使える幅 */
  availablePx: number;
  /** basePx で書いたときの、3つの見出しの幅 */
  titleWidthsPx: number[];
}): number | null {
  const measurable = (value: number) => Number.isFinite(value) && value > 0;
  if (
    !measurable(availablePx) ||
    titleWidthsPx.length === 0 ||
    !titleWidthsPx.every(measurable)
  ) {
    return null;
  }
  const widest = Math.max(...titleWidthsPx);
  if (widest <= availablePx) {
    return null;
  }
  // 四捨五入や切り上げだと、また入りきらなくなるので切り捨てる
  return Math.max(minPx, Math.floor((basePx * availablePx) / widest));
}

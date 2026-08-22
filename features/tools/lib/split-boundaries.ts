/**
 * 分割位置の持ち方。**「使う範囲」と「その中の仕切り」**の2階建てで表す。
 *
 * ## なぜ範囲まで動かせるようにするか
 *
 * 等分だけだと、切れ目がキャラクターの顔や体を横切ることがよくある。
 * 仕切りだけ動かせても、16:9 の中央に立ち絵があるような構図では
 * **どこかの線が必ず体を通る**ので逃げ切れない。
 *
 * 使う範囲(start/end)も動かせると「画像全体を割る」から
 * **「使う範囲を選んでから割る」**に変わる。キャラクターが少し左に寄って
 * いるなら右端を詰めるだけで線が体を外れる、という逃げ道ができる。
 * 範囲の外は捨てられる(トリミング)。
 *
 * ## 単位は 0..1 の正規化座標
 *
 * 元画像の px ではなく比率で持つ。表示は縮小されているので、ドラッグの
 * 計算も保存も比率のほうが素直で、画像を差し替えても破綻しない。
 * px への変換は切り出しの直前(`computeSplitRects`)だけで行う。
 */

/** 隣り合う境界の最小間隔(比率)。潰れた断片や 0px を作らないための下限。 */
export const MIN_SEGMENT_RATIO = 0.02;

export interface SplitBoundaries {
  /** 使う範囲の開始。左端(縦分割) or 上端(横分割)。既定 0 */
  start: number;
  /** 使う範囲の終了。既定 1 */
  end: number;
  /**
   * 範囲の中の仕切り。昇順で `start < dividers[0] < ... < end`。
   * 枚数 N に対して長さ N-1。
   */
  dividers: number[];
}

/** すべての境界を左から右へ1本の配列にしたもの(長さ N+1)。 */
export function toBoundaryList(boundaries: SplitBoundaries): number[] {
  return [boundaries.start, ...boundaries.dividers, boundaries.end];
}

/** 全体を使って等分する既定値。 */
export function createEqualBoundaries(count: number): SplitBoundaries {
  return redistributeDividers({ start: 0, end: 1, dividers: [] }, count);
}

/**
 * 使う範囲はそのままに、仕切りだけ等間隔へ引き直す。
 *
 * 枚数を変えたときに使う。**範囲を保つのが要点**で、せっかく詰めた端が
 * 枚数変更で戻ってしまうと、調整をやり直す羽目になる。
 */
export function redistributeDividers(
  boundaries: SplitBoundaries,
  count: number,
): SplitBoundaries {
  const span = boundaries.end - boundaries.start;
  const dividers = Array.from(
    { length: Math.max(0, count - 1) },
    (_, i) => boundaries.start + (span * (i + 1)) / count,
  );
  return { start: boundaries.start, end: boundaries.end, dividers };
}

/** 何番目の境界を掴んでいるか。0 = 開始端、length-1 = 終了端。 */
export type BoundaryIndex = number;

/**
 * 境界を1本動かした結果を返す(元の値は変えない)。
 *
 * ## 端と仕切りで挙動を変える
 *
 * - **端(start/end)は「構図を決める枠」**。動かすと中の仕切りも
 *   **比率を保ったまま一緒に動く**。こうしないと端を詰めても切れ目の位置が
 *   変わらず、「端を詰めて切れ目をキャラクターから外す」ができない
 *   (実際に触って気づいた。仕切りが残ると断片が 80/200/200/40 のように歪む)。
 *   等分だった仕切りは等分のまま、寄せていた仕切りは寄せた比率のまま残る。
 * - **仕切りは「切る場所」**。両隣との間に `MIN_SEGMENT_RATIO` を残す位置で
 *   止まり、隣を押しのけない。押しのける挙動にすると、端まで引いたときに
 *   他の断片が次々と潰れて元に戻せなくなる。
 */
export function moveBoundary(
  boundaries: SplitBoundaries,
  index: BoundaryIndex,
  nextValue: number,
): SplitBoundaries {
  const list = toBoundaryList(boundaries);
  if (index < 0 || index >= list.length) {
    return boundaries;
  }

  const isStart = index === 0;
  const isEnd = index === list.length - 1;

  if (isStart || isEnd) {
    return moveEdge(boundaries, isStart ? "start" : "end", nextValue);
  }

  // 仕切りは両隣との最小間隔まで
  const lower = list[index - 1] + MIN_SEGMENT_RATIO;
  const upper = list[index + 1] - MIN_SEGMENT_RATIO;
  const clamped = Math.min(Math.max(nextValue, lower), Math.max(lower, upper));

  const updated = [...list];
  updated[index] = clamped;
  return {
    start: updated[0],
    end: updated[updated.length - 1],
    dividers: updated.slice(1, -1),
  };
}

/**
 * 端を動かし、中の仕切りを比率ごと連れて動かす。
 *
 * 範囲が潰れないよう、**断片1枚あたり `MIN_SEGMENT_RATIO` を確保できる幅**で
 * 止める(枚数ぶんの最小幅)。
 */
function moveEdge(
  boundaries: SplitBoundaries,
  edge: "start" | "end",
  nextValue: number,
): SplitBoundaries {
  const count = boundaries.dividers.length + 1;
  const minSpan = MIN_SEGMENT_RATIO * count;
  const oldSpan = boundaries.end - boundaries.start;

  const nextStart =
    edge === "start"
      ? Math.min(Math.max(nextValue, 0), boundaries.end - minSpan)
      : boundaries.start;
  const nextEnd =
    edge === "end"
      ? Math.max(Math.min(nextValue, 1), boundaries.start + minSpan)
      : boundaries.end;

  const nextSpan = nextEnd - nextStart;
  // 幅0の割り算を避ける(通常は minSpan で止まるので到達しない)
  const scale = oldSpan > 0 ? nextSpan / oldSpan : 0;

  return {
    start: nextStart,
    end: nextEnd,
    dividers: boundaries.dividers.map(
      (d) => nextStart + (d - boundaries.start) * scale,
    ),
  };
}

/** 端を全体に戻し、仕切りも等間隔にする(「均等に戻す」用)。 */
export function resetBoundaries(count: number): SplitBoundaries {
  return createEqualBoundaries(count);
}

/** 既定(全体を等分)のままか。「均等に戻す」を出すかの判定に使う。 */
export function isEqualBoundaries(
  boundaries: SplitBoundaries,
  count: number,
): boolean {
  const equal = createEqualBoundaries(count);
  const a = toBoundaryList(boundaries);
  const b = toBoundaryList(equal);
  if (a.length !== b.length) return false;
  // 表示上ほぼ同じなら等分とみなす(ドラッグの丸め誤差を拾わない)
  return a.every((value, i) => Math.abs(value - b[i]) < 0.001);
}

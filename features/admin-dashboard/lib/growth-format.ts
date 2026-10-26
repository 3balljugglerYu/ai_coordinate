/**
 * 概要の数の表示(純関数)。今週の答えの文と、ツリー・釣り合いのカードで同じ見せ方にする。
 */

/** RPC の bigint などを数にする。数でなければ 0。 */
export function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 割合。null(分母0)は「—」。 */
export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/** 前との差。0 は「±0」、減ったときは全角の「−」。 */
export function formatDiff(current: number, previous: number, unit = ""): string {
  const d = current - previous;
  if (d === 0) return "±0";
  return `${d > 0 ? "+" : "−"}${formatCount(Math.abs(d))}${unit}`;
}

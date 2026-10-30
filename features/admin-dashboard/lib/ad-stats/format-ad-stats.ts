import type { AdBreakdownType } from "./ad-stats-types";
import { ratio } from "./summarize-ad-stats";

/**
 * 「広告の成果」の数字の書き方（表とグラフで同じにする）。
 * 値が無い（列が無い・分母が0）ときは「—」。
 */

export const formatYen = (value: number | null) =>
  value === null ? "—" : `${Math.round(value).toLocaleString("ja-JP")}円`;

export const formatCount = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("ja-JP");

/** 1%未満は小数3桁まで出す（X のクリック率は 0.013% のように小さい）。0 は「0%」 */
export const formatPercent = (value: number | null) => {
  if (value === null) return "—";
  if (value === 0) return "0%";
  return `${(value * 100).toFixed(value < 0.01 ? 3 : 2)}%`;
};

/** 横棒に添える割合（整数）。0より大きく1%に届かないときは「1%未満」 */
export const formatShare = (value: number) =>
  value > 0 && value < 0.005 ? "1%未満" : `${Math.round(value * 100)}%`;

export const formatPerUnit = (spend: number, units: number | null) =>
  formatYen(ratio(spend, units));

const VALUE_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
  unknown: "不明",
};

/** 内訳の値の表示名（性別と「不明」だけ日本語にする） */
export function formatBreakdownValue(type: AdBreakdownType, value: string): string {
  if (type === "gender" || value === "unknown") return VALUE_LABELS[value] ?? value;
  return value;
}

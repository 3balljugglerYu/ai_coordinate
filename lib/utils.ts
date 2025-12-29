import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type Unit = { suffix: string; value: number };

/**
 * YouTube風（en-US）フォロワー/カウント表示
 * - 最大有効桁3
 * - 四捨五入
 * - .0省略
 * - 1000到達で上位単位へ繰り上げ
 * 
 * @param n フォーマットする数値
 * @returns フォーマットされた文字列（例: "1.53K", "20.7K", "133K", "1.8M"）
 */
export function formatCountEnUS(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 0) return `-${formatCountEnUS(-n)}`;

  // 999未満はそのまま（YouTube風）
  if (n < 1000) return Math.floor(n).toString();

  const units: Unit[] = [
    { suffix: "K", value: 1_000 },
    { suffix: "M", value: 1_000_000 },
    { suffix: "B", value: 1_000_000_000 },
  ];

  // 初期単位を決める
  let u = units.length - 1;
  while (u > 0 && n < units[u].value) u--;

  while (true) {
    const base = units[u].value;
    let v = n / base;

    // 有効桁3に合わせて小数桁を決める（丸め前の値で判定）
    let decimals = 0;
    if (v < 10) decimals = 2;
    else if (v < 100) decimals = 1;

    // 丸めによって桁上がりする場合を考慮して、小数桁を再調整する
    // 例: 9.95K -> 10K, 99.5K -> 100K
    if (decimals === 2 && Math.round((v + Number.EPSILON) * 10) / 10 >= 10) {
      decimals = 1;
    }
    if (decimals === 1 && Math.round(v + Number.EPSILON) >= 100) {
      decimals = 0;
    }

    const factor = 10 ** decimals;
    v = Math.round((v + Number.EPSILON) * factor) / factor;

    // 1000到達なら上位単位へ（可能なら）
    if (v >= 1000 && u < units.length - 1) {
      u += 1;
      continue; // 再計算（同一関数内で単位だけ進む）
    }

    // .0 省略
    let s = v.toFixed(decimals);
    if (s.includes('.')) {
      s = s.replace(/0+$/, "").replace(/\.$/, "");
    }

    return s + units[u].suffix;
  }
}


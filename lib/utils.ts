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

    // decimals が落ち着くまで最大2回やり直し
    // 丸めで桁が増えたら decimals を減らして再丸め
    for (let i = 0; i < 2; i++) {
      const factor = 10 ** decimals;
      const rounded = Math.round((v + Number.EPSILON) * factor) / factor;

      // 丸めで桁が増えたら decimals を減らす（例: 9.995 -> 10.0）
      if (decimals === 2 && rounded >= 10) {
        decimals = 1;
        continue; // 再丸め
      }
      if (decimals === 1 && rounded >= 100) {
        decimals = 0;
        continue; // 再丸め
      }

      // 小数2桁で丸めた結果が10未満だが、小数1桁で丸めると10以上になる場合
      // 例: 9.95 (小数2桁) -> 9.95, 9.95 (小数1桁) -> 10.0
      if (decimals === 2 && rounded < 10) {
        const rounded1 = Math.round((v + Number.EPSILON) * 10) / 10;
        if (rounded1 >= 10) {
          decimals = 1;
          continue; // 再丸め
        }
      }
      // 小数1桁で丸めた結果が100未満だが、整数で丸めると100以上になる場合
      if (decimals === 1 && rounded < 100) {
        const rounded0 = Math.round(v + Number.EPSILON);
        if (rounded0 >= 100) {
          decimals = 0;
          continue; // 再丸め
        }
      }

      v = rounded;
      break;
    }

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


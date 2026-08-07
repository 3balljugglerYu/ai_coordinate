"use client";

import { useEffect, useState } from "react";

export interface UsageRewardAmounts {
  promptUsageRewardAmount: number;
  styleUsageRewardAmount: number;
}

const ZERO: UsageRewardAmounts = {
  promptUsageRewardAmount: 0,
  styleUsageRewardAmount: 0,
};

/**
 * モジュールスコープのキャッシュ。投稿モーダルは何度も開き閉じされるため、
 * そのたびに取りに行かないようにする。運営が額を変えたときは
 * 次回のページ読み込みで反映される（告知の出し分けに秒単位の即時性は不要）。
 */
let cached: UsageRewardAmounts | null = null;
let inFlight: Promise<UsageRewardAmounts> | null = null;

/** テスト専用。モジュールスコープのキャッシュを捨てる。 */
export function __resetUsageRewardAmountsCacheForTests(): void {
  cached = null;
  inFlight = null;
}

async function fetchUsageRewardAmounts(): Promise<UsageRewardAmounts> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  // fetch が無い環境(テストの jsdom 等)では取りに行かず停止中扱いにする。
  // 告知は「出さない方が安全」なので 0 で構わない。
  if (typeof fetch === "undefined") {
    return ZERO;
  }

  inFlight = fetch("/api/percoin/usage-reward")
    .then((res) => (res.ok ? res.json() : ZERO))
    .then((data: Partial<UsageRewardAmounts>) => {
      const value: UsageRewardAmounts = {
        promptUsageRewardAmount:
          typeof data.promptUsageRewardAmount === "number"
            ? data.promptUsageRewardAmount
            : 0,
        styleUsageRewardAmount:
          typeof data.styleUsageRewardAmount === "number"
            ? data.styleUsageRewardAmount
            : 0,
      };
      cached = value;
      return value;
    })
    .catch(() => ZERO)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * クリエイター還元の付与額。0 は停止中で、呼び出し側は告知を出さない。
 * 取得前・取得失敗時も 0 を返すので、「もらえないのに告知が出る」ことはない。
 */
export function useUsageRewardAmounts(): UsageRewardAmounts {
  const [amounts, setAmounts] = useState<UsageRewardAmounts>(cached ?? ZERO);

  useEffect(() => {
    let active = true;

    // cached があっても同期 setState はしない(エフェクト内の同期更新は
    // 連鎖レンダーの原因になる)。解決済み Promise 経由で次のティックに回す。
    void fetchUsageRewardAmounts().then((value) => {
      if (active) setAmounts(value);
    });

    return () => {
      active = false;
    };
  }, []);

  return amounts;
}

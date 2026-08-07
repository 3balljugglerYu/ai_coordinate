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

/** キャッシュの有効期間。 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * モジュールスコープのキャッシュ。投稿モーダルは何度も開き閉じされるため、
 * そのたびに取りに行かないようにする。
 *
 * 期限を持たせるのが要点:
 *   - 無期限だと、運営が額を 0（停止）にしても、同じタブでは
 *     ハードリロードするまで古い告知が出続ける（Next.js のクライアント遷移では
 *     読み込み済みモジュールが保持されるため）
 *   - 失敗時の 0 もキャッシュする。しないと通信障害中にモーダルを開くたび
 *     リクエストが飛ぶ
 */
let cached: { value: UsageRewardAmounts; expiresAt: number } | null = null;
let inFlight: Promise<UsageRewardAmounts> | null = null;

function putCache(value: UsageRewardAmounts): UsageRewardAmounts {
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

function readCache(): UsageRewardAmounts | null {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  return null;
}

/** テスト専用。モジュールスコープのキャッシュを捨てる。 */
export function __resetUsageRewardAmountsCacheForTests(): void {
  cached = null;
  inFlight = null;
}

async function fetchUsageRewardAmounts(): Promise<UsageRewardAmounts> {
  const fresh = readCache();
  if (fresh) return fresh;
  if (inFlight) return inFlight;

  // fetch が無い環境(テストの jsdom 等)では取りに行かず停止中扱いにする。
  // 告知は「出さない方が安全」なので 0 で構わない。
  if (typeof fetch === "undefined") {
    return ZERO;
  }

  inFlight = fetch("/api/percoin/usage-reward")
    .then((res) => (res.ok ? res.json() : ZERO))
    .then((data: Partial<UsageRewardAmounts>) =>
      putCache({
        promptUsageRewardAmount:
          typeof data.promptUsageRewardAmount === "number"
            ? data.promptUsageRewardAmount
            : 0,
        styleUsageRewardAmount:
          typeof data.styleUsageRewardAmount === "number"
            ? data.styleUsageRewardAmount
            : 0,
      })
    )
    // 失敗も同じ期限でキャッシュする(障害中の連打を避ける)
    .catch(() => putCache(ZERO))
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
  const [amounts, setAmounts] = useState<UsageRewardAmounts>(
    () => readCache() ?? ZERO
  );

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

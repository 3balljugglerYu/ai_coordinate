export async function fetchPercoinBalance() {
  const response = await fetch("/api/credits/balance", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("ペルコイン残高の取得に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function consumePercoins(options: {
  generationId: string;
  percoins: number;
}) {
  const response = await fetch("/api/credits/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      generationId: options.generationId,
      credits: options.percoins,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "ペルコインの消費に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function completeMockPercoinPurchase(options: { packageId: string }) {
  const response = await fetch("/api/credits/mock-complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "ペルコイン購入処理に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function checkStreakBonus() {
  const response = await fetch("/api/streak/check", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    // 401エラー（認証エラー）の場合は、例外をthrowせずに空のレスポンスを返す
    // 認証状態のチェックは呼び出し元（StreakChecker）で行うため、ここでは静かに失敗
    if (response.status === 401) {
      return { bonus_granted: 0, streak_days: null };
    }

    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "連続ログインボーナスの確認に失敗しました");
  }

  return response.json() as Promise<{ bonus_granted: number; streak_days: number | null }>;
}

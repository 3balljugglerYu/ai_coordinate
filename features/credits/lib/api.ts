interface CreditsApiMessages {
  fetchBalanceFailed?: string;
  consumeFailed?: string;
  mockPurchaseFailed?: string;
}

export async function fetchPercoinBalance(messages?: CreditsApiMessages) {
  const response = await fetch("/api/credits/balance", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.fetchBalanceFailed || "ペルコイン残高の取得に失敗しました"
    );
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function consumePercoins(options: {
  generationId: string;
  percoins: number;
}, messages?: CreditsApiMessages) {
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
    throw new Error(error?.error || messages?.consumeFailed || "ペルコインの消費に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function completeMockPercoinPurchase(
  options: { packageId: string },
  messages?: CreditsApiMessages
) {
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
    throw new Error(
      error?.error || messages?.mockPurchaseFailed || "ペルコイン購入処理に失敗しました"
    );
  }

  return response.json() as Promise<{ balance: number }>;
}

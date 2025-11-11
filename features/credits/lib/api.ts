export async function fetchCreditBalance() {
  const response = await fetch("/api/credits/balance", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("クレジット残高の取得に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function consumeCredits(options: {
  generationId: string;
  credits: number;
}) {
  const response = await fetch("/api/credits/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "クレジットの消費に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

export async function completeMockPurchase(options: { packageId: string }) {
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
    throw new Error(error?.error || "クレジット購入処理に失敗しました");
  }

  return response.json() as Promise<{ balance: number }>;
}

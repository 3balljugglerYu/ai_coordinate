"use client";

import Script from "next/script";

interface StripePricingTableProps {
  userId?: string;
  publishableKey: string;
  pricingTableId: string;
}

export function StripePricingTable({
  userId,
  publishableKey,
  pricingTableId,
}: StripePricingTableProps) {
  // 公開キーが設定されていない場合はエラーを表示
  if (!publishableKey) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          Stripe公開キーが設定されていません。環境変数を確認してください。
        </p>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://js.stripe.com/v3/pricing-table.js"
        strategy="lazyOnload"
      />
      <stripe-pricing-table
        pricing-table-id={pricingTableId}
        publishable-key={publishableKey}
        {...(userId ? { "client-reference-id": userId } : {})}
      />
    </>
  );
}

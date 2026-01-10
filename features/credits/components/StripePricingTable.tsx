"use client";

import Script from "next/script";
import { env } from "@/lib/env";

interface StripePricingTableProps {
  userId?: string;
}

export function StripePricingTable({ userId }: StripePricingTableProps) {
  // 環境変数から取得、なければデフォルト値（テスト環境のID）を使用
  const pricingTableId =
    env.STRIPE_PRICING_TABLE_ID ||
    env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID ||
    process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID ||
    "prctbl_1So3YGEtgRYjQynQvtDbE755"; // テスト環境のデフォルト値

  const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

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

  // デバッグ用: userIdが設定されているか確認
  if (!userId) {
    console.warn("[StripePricingTable] userId is not provided. client-reference-id will not be set.");
  } else {
    console.log("[StripePricingTable] Setting client-reference-id:", userId);
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

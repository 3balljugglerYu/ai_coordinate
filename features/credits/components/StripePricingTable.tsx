"use client";

import Script from "next/script";
import { env } from "@/lib/env";

interface StripePricingTableProps {
  userId?: string;
}

export function StripePricingTable({ userId }: StripePricingTableProps) {
  // 環境変数から取得、なければデフォルト値（テスト環境のID）を使用
  // クライアントコンポーネントでは NEXT_PUBLIC_ プレフィックスを持つ環境変数のみ使用可能
  // 直接process.envにアクセス（Next.jsではクライアント側でもNEXT_PUBLIC_*は利用可能）
  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    "";

  const pricingTableId =
    process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID ||
    env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID ||
    "prctbl_1So3YGEtgRYjQynQvtDbE755"; // テスト環境のデフォルト値

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

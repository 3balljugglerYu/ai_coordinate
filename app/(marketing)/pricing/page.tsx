import type { Metadata } from "next";
import Link from "next/link";
import { Tag, CreditCard, Timer, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CREDIT_PACKAGES, GENERATION_CREDIT_COST } from "@/features/credits/credit-packages";

export const metadata: Metadata = {
  title: "料金",
  description: "Persta.AI の料金と支払い条件",
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold md:text-2xl">料金</h1>
        <p className="mt-2 text-sm text-gray-600">クレジット購入の価格とお支払い条件についてご案内します。</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-500" />
              クレジット料金表（すべて税込）
            </CardTitle>
            <CardDescription>購入画面でも税込価格を表示します。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {CREDIT_PACKAGES.map((pkg) => (
                <div key={pkg.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-gray-900">{pkg.name}</p>
                      <p className="text-sm text-gray-600">{pkg.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">¥{pkg.priceYen.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">({pkg.credits}クレジット)</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-600">
              目安：画像生成1回あたり {GENERATION_CREDIT_COST} クレジットを消費します。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-500" />
              支払い方法とタイミング
            </CardTitle>
            <CardDescription>決済手段と課金のタイミングです。</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-gray-500">支払方法</dt>
                <dd className="mt-1 text-gray-800">クレジットカード（Stripe）</dd>
              </div>
              <div>
                <dt className="text-gray-500">支払時期</dt>
                <dd className="mt-1 text-gray-800">購入手続き完了時に即時決済されます。</dd>
              </div>
              <div>
                <dt className="text-gray-500">追加手数料</dt>
                <dd className="mt-1 text-gray-800">なし</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-gray-500" />
              提供開始時期
            </CardTitle>
            <CardDescription>購入後の利用開始タイミングです。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-800">
              決済完了後、即時にクレジットが付与され利用可能です。通信状況等により反映に時間がかかる場合があります。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gray-500" />
              返金・キャンセル
            </CardTitle>
            <CardDescription>特商法ページと同じポリシーです。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
              <li>デジタル商品の性質上、正常品についての返金・キャンセル・交換はお受けしておりません。</li>
              <li>不具合・障害など弊社責による問題がある場合は、購入後7日以内にメールでご連絡ください。返金または再提供で対応いたします。</li>
              <li>連絡先：<Link href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">yuh.products@gmail.com</Link></li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

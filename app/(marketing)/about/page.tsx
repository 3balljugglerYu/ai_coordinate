import type { Metadata } from "next";
import Link from "next/link";
import { Info, Sparkles, CreditCard, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "サービス紹介",
  description: "Persta.AI のサービス概要と提供内容",
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold md:text-2xl">サービス紹介</h1>
        <p className="mt-2 text-sm text-gray-600">Persta.AI の提供内容とご利用条件についてご案内します。</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-gray-500" />
              サービス概要
            </CardTitle>
            <CardDescription>AIで生成されたファッションコーディネート画像を共有・閲覧できるプラットフォームです。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
              <li>ユーザーが生成したコーディネート画像を投稿し、コミュニティで共有・閲覧できます。</li>
              <li>生成用のクレジットを購入すると、コーディネート生成を追加で利用できます。</li>
              <li>基本機能はWebブラウザから利用でき、追加のソフトウェアインストールは不要です。</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gray-500" />
              提供内容と開始時期
            </CardTitle>
            <CardDescription>利用できる機能と提供開始のタイミングです。</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-gray-500">提供機能</dt>
                <dd className="mt-1 text-gray-800">画像生成・投稿・閲覧・コメントなどのコミュニティ機能</dd>
              </div>
              <div>
                <dt className="text-gray-500">提供開始時期</dt>
                <dd className="mt-1 text-gray-800">決済完了後すぐにご利用いただけます。</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-gray-500">反映遅延</dt>
                <dd className="mt-1 text-gray-800">通信状況等により表示まで時間がかかる場合があります。</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-500" />
              料金とお支払い
            </CardTitle>
            <CardDescription>価格表示と支払い条件についてのご案内です。</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-gray-500">価格</dt>
                <dd className="mt-1 text-gray-800">
                  <Link href="/pricing" className="text-primary underline underline-offset-2">
                    料金ページ
                  </Link>
                  で税込価格を表示しています。
                </dd>
              </div>
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
              <ShieldCheck className="h-4 w-4 text-gray-500" />
              返金・キャンセル
            </CardTitle>
            <CardDescription>特商法ページと同じポリシーを簡潔に記載しています。</CardDescription>
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

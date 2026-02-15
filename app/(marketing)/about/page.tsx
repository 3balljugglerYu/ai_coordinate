import type { Metadata } from "next";
import Link from "next/link";
import { Info, Sparkles, CreditCard, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSiteUrl } from "@/lib/env";

export const metadata: Metadata = {
  title: "サービス紹介",
  description: "Persta.AI のサービス概要と提供内容",
  openGraph: {
    title: "サービス紹介 | Persta.AI",
    description: "Persta.AI のサービス概要と提供内容",
    url: getSiteUrl() ? `${getSiteUrl()}/about` : undefined,
    siteName: "Persta.AI",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "サービス紹介 | Persta.AI",
    description: "Persta.AI のサービス概要と提供内容",
  },
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
            <CardDescription>Persta.AIは、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
              <li>ユーザーが生成したコーディネート画像を投稿し、コミュニティで共有・閲覧できます。</li>
              <li>生成用のペルコインを購入すると、コーディネート生成を追加で利用できます。</li>
              <li>基本機能はWebブラウザから利用でき、追加のソフトウェアインストールは不要です。</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

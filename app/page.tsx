import Link from "next/link";
import { Sparkles, Image as ImageIcon, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* ヒーローセクション */}
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            AI着せ替え
            <span className="text-primary">コーディネート</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            AIの力で、あなたのイラストに新しい服を着せ替え。
            <br />
            好きなスタイルで、無限のコーディネートを楽しもう。
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link href="/signup">
              <Button size="lg" className="text-lg">
                <Sparkles className="mr-2 h-5 w-5" />
                無料で始める
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-lg">
                ログイン
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 機能紹介 */}
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
          主な機能
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Sparkles className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-gray-900">
              AI着せ替え
            </h3>
            <p className="text-gray-600">
              人物イラストをアップロードして、AIで自由に服を着せ替え。顔やスタイルはそのままに、新しいコーディネートを楽しめます。
            </p>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
              <ImageIcon className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-gray-900">
              マイページ
            </h3>
            <p className="text-gray-600">
              生成した画像はすべてマイページに保存。いつでも見返したり、投稿したりすることができます。
            </p>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
              <Heart className="h-6 w-6 text-pink-600" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-gray-900">
              投稿・シェア
            </h3>
            <p className="text-gray-600">
              お気に入りの画像を投稿して、他のユーザーと共有。いいねやコメントでコミュニケーションも。
            </p>
          </Card>
        </div>
      </div>

      {/* 料金プラン */}
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
          シンプルな料金プラン
        </h2>
        <div className="mx-auto max-w-md">
          <Card className="p-8">
            <h3 className="mb-4 text-2xl font-bold text-gray-900">
              クレジット制
            </h3>
            <p className="mb-6 text-gray-600">
              必要な分だけクレジットを購入。1枚の画像生成に10クレジットを使用します。
            </p>
            <div className="mb-6 space-y-2 text-sm text-gray-600">
              <p>✓ 新規登録で50クレジット（5枚分）プレゼント</p>
              <p>✓ 100クレジット: 500円〜</p>
              <p>✓ クレジットに有効期限なし</p>
            </div>
            <Link href="/signup">
              <Button className="w-full" size="lg">
                今すぐ始める
              </Button>
            </Link>
          </Card>
        </div>
      </div>

      {/* CTA */}
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Card className="bg-gradient-to-r from-blue-500 to-purple-600 p-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">
            さあ、始めましょう
          </h2>
          <p className="mb-8 text-lg text-white/90">
            無料で新規登録して、5枚の画像生成を体験しよう
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="text-lg">
              <Sparkles className="mr-2 h-5 w-5" />
              無料で始める
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}

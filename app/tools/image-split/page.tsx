import type { Metadata } from "next";
import { createCanonicalAlternates } from "@/lib/metadata";
import { ImageSplitTool } from "@/features/tools/components/ImageSplitTool";

// X 投稿用の画像分割ツール(未ログインで使える公開ページ)。
// 処理はすべてブラウザ内で完結し、サーバーには何も送らない。

const PAGE_TITLE = "X用 画像4分割ツール｜縦4分割・横4分割・2×2対応・無料 | Persta.AI";
const PAGE_DESCRIPTION =
  "横長画像を縦に4分割してXに投稿できる無料ツール。縦長画像の横4分割・2×2分割にも対応。ブラウザ内で処理するので画像はアップロードされず、登録も不要。スマホは共有シートから写真に保存して、Xアプリですぐ投稿できます。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/tools/image-split"),
  openGraph: {
    title: "X用 画像4分割ツール｜縦4分割・横4分割・2×2対応",
    description:
      "横長画像を縦4分割してXへ。横4分割・2×2も。ブラウザ内処理でアップロード不要・登録不要の無料ツール。",
    type: "website",
    siteName: "Persta.AI",
  },
  twitter: {
    card: "summary",
    title: "X用 画像4分割ツール｜縦4分割・横4分割・2×2対応",
    description:
      "横長画像を縦4分割してXへ。横4分割・2×2も。ブラウザ内処理でアップロード不要・登録不要の無料ツール。",
  },
};

export default function ImageSplitPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            X用 画像4分割ツール
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            横長の画像を縦に4分割して、Xに投稿できる形で保存します。
            縦長画像の横4分割・2×2分割にも対応。タイムラインでは2×2に並び、
            タップしてスワイプするとパノラマのようにつながって見えます。
            登録不要・無料です。
          </p>
        </header>
        <ImageSplitTool />
      </div>
    </main>
  );
}

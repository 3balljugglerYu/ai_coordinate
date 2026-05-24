import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

export const metadata: Metadata = {
  title: "申請ありがとうございます | 絵師カタログ | Persta.AI",
};

export default async function CatalogSubmitThanksPage() {
  await connection();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          申請ありがとうございました
        </h1>
        <p className="mt-4 text-slate-600">
          運営者が確認のうえ、承認 / 差戻しを判断します。通知用メールをご入力いただいた場合は結果をメールでお送りします。
        </p>
        <p className="mt-2 text-slate-500">
          通常 1〜3 日以内に確認します。お時間をいただく場合がありますがご了承ください。
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            カタログ一覧へ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

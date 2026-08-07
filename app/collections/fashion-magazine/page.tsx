import type { Metadata } from "next";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { FashionMagazineGuide } from "@/features/collections/components/FashionMagazineGuide";

// うちの子のファッション雑誌：夏(8ページ構成・book 完走ビュー)。
// カテゴリ: fashion_magazine_summer

const PAGE_TITLE =
  "うちの子のファッション雑誌：夏｜8ページそろえて1冊完成 | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子が夏の誌面の主役に。表紙から裏表紙まで全8ページを生成すると、めくって読めるデジタル雑誌が完成。Xシェアで抽選5名にAmazonギフト券2,000円分。8/8〜8/16開催。";

// TODO: OGP画像はユーザーから支給され次第 /og/ 配下へ配置して images を追加する
// (画像なしの間は images を省略し、タイトル/説明のみのカードにフォールバック)。
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections/fashion-magazine"),
  openGraph: {
    title: "うちの子のファッション雑誌：夏｜8ページそろえて1冊完成",
    description:
      "うちの子が夏の誌面の主役に。全8ページで、めくって読める1冊が完成。Xシェアで抽選5名にAmazonギフト券2,000円分。",
    type: "website",
    siteName: "Persta.AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "うちの子のファッション雑誌：夏｜8ページそろえて1冊完成",
    description:
      "うちの子が夏の誌面の主役に。全8ページで、めくって読める1冊が完成。Xシェアで抽選5名にAmazonギフト券2,000円分。",
  },
};

export default async function FashionMagazineGuidePage() {
  await connection();
  return <FashionMagazineGuide />;
}

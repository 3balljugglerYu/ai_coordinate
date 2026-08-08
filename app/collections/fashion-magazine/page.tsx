import type { Metadata } from "next";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { FashionMagazineGuide } from "@/features/collections/components/FashionMagazineGuide";

// うちの子のファッション雑誌：夏(8ページ構成・book 完走ビュー)。
// カテゴリ: fashion_magazine_summer

const PAGE_TITLE =
  "うちの子のファッション雑誌｜8ページそろえて1冊完成 | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子が夏の誌面の主役に。表紙から裏表紙まで全8ページを生成すると、めくって読めるデジタル雑誌が完成。Xシェアで抽選5名にAmazonギフト券2,000円分。8/8〜8/16開催。";

const OGP_IMAGE = "/collections/fashion-magazine/ogp.jpg";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections/fashion-magazine"),
  openGraph: {
    title: "うちの子のファッション雑誌｜8ページそろえて1冊完成",
    description:
      "うちの子が夏の誌面の主役に。全8ページで、めくって読める1冊が完成。Xシェアで抽選5名にAmazonギフト券2,000円分。",
    type: "website",
    siteName: "Persta.AI",
    images: [
      {
        url: OGP_IMAGE,
        width: 1200,
        height: 630,
        alt: "うちの子のファッション雑誌 総額10,000円アマギフプレゼントキャンペーン 8/8 19:00〜8/16 21:59",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "うちの子のファッション雑誌｜8ページそろえて1冊完成",
    description:
      "うちの子が夏の誌面の主役に。全8ページで、めくって読める1冊が完成。Xシェアで抽選5名にAmazonギフト券2,000円分。",
    images: [OGP_IMAGE],
  },
};

export default async function FashionMagazineGuidePage() {
  await connection();
  return <FashionMagazineGuide />;
}

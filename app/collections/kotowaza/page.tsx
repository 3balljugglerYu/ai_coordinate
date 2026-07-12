import type { Metadata } from "next";
import { connection } from "next/server";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { KotowazaGuide } from "@/features/collections/components/KotowazaGuide";

// うちの子のことわざ辞典(全6語)。雑葉(@sacher10610)コラボ企画。
const KOTOWAZA_KEY = "kotowaza_dictionary";

const PAGE_TITLE =
  "うちの子のことわざ辞典｜6語そろえてコンプリート | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子が、ことわざの世界の住人に。全6語をあつめて、じぶんだけの「ことわざ辞典」コンプリートカードを完成させよう。ダウンロードして SNS でシェア！";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "うちの子のことわざ辞典｜6語そろえてコンプリート",
    description:
      "うちの子が、ことわざの世界の住人に。全6語をあつめてコンプリートカードをつくろう。",
    type: "website",
    siteName: "Persta.AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "うちの子のことわざ辞典｜6語そろえてコンプリート",
    description:
      "うちの子が、ことわざの世界の住人に。全6語をあつめてコンプリートカードをつくろう。",
  },
};

export default async function KotowazaCollectionGuidePage() {
  await connection();

  // カテゴリ作成前でもページを公開できるよう threshold=6 にフォールバック。
  // admin_only 期間中もプレビューできるよう(神コレページと同方式)カテゴリだけ参照する。
  const category = await getPresetCategoryByKey(KOTOWAZA_KEY);
  const threshold = category?.completionThreshold ?? 6;

  return <KotowazaGuide threshold={threshold} />;
}

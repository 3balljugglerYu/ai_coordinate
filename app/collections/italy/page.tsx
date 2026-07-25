import type { Metadata } from "next";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";
import { ItalyTravelGuide } from "@/features/collections/components/ItalyTravelGuide";

// うちの子のイタリア旅行日記(表紙=はじまり + Day1〜Day8 の全9種)。コラボ企画。
const ITALY_KEY = "travel_to_italy";

const PAGE_TITLE =
  "うちの子のイタリア旅行日記｜9種そろえてめくれる旅行日記をつくろう | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子をイタリア旅行へ。表紙「はじまり」から Day1・Day2… と1つずつ解放して全9種をあつめると、1ページずつめくれる旅行日記(本)が完成。ダウンロードして SNS でシェア！";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections/italy"),
  openGraph: {
    title: "うちの子のイタリア旅行日記｜めくれる旅行日記をつくろう",
    description:
      "うちの子をイタリア旅行へ。全9種をあつめて、めくれる旅行日記をつくろう。",
    type: "website",
    siteName: "Persta.AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "うちの子のイタリア旅行日記｜めくれる旅行日記をつくろう",
    description:
      "うちの子をイタリア旅行へ。全9種をあつめて、めくれる旅行日記をつくろう。",
  },
};

export default async function ItalyCollectionGuidePage() {
  await connection();

  // admin_only 期間中もプレビューできるよう includeAdminOnly で取得。
  const [category, allPresets] = await Promise.all([
    getPresetCategoryByKey(ITALY_KEY),
    listPublishedStylePresets({ includeAdminOnly: true }),
  ]);

  const threshold = category?.completionThreshold ?? 9;
  // sort_order 昇順(はじまり → Day1 → … → Day8)で取得済み。
  const presets = allPresets
    .filter((p) => p.category.key === ITALY_KEY)
    .map((p) => ({
      id: p.id,
      title: p.title,
      thumbnailImageUrl: p.thumbnailImageUrl,
    }));

  return <ItalyTravelGuide threshold={threshold} presets={presets} />;
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";
import { AustraliaTravelGuide } from "@/features/collections/components/AustraliaTravelGuide";

// うちの子のオーストラリア旅行(表紙 + 7ページ の全8種)。ちゃんりおさんとのコラボ企画。
// イタリア(travel_to_italy)と違い、10日間の旅程を8枚に集約しているため
// Day 番号とページ番号は 1 対 1 ではない(Day1-2 / Day6-7 / Day8-9 が2日分で1枚)。
const AUSTRALIA_KEY = "travel_to_australia";

const PAGE_TITLE =
  "うちの子のオーストラリア旅行｜8種そろえてめくれる旅行日記をつくろう | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子をオーストラリア10日間の旅へ。表紙「旅のはじまり」からケアンズ・ウルル・シドニーと1つずつ解放して全8種をあつめると、1ページずつめくれる旅行日記(本)が完成。ダウンロードして SNS でシェア！";

const OG_TITLE = "うちの子のオーストラリア旅行｜めくれる旅行日記をつくろう";
const OG_DESCRIPTION =
  "うちの子をオーストラリアへ。全8種をあつめて、めくれる旅行日記をつくろう。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections/australia"),
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    type: "website",
    siteName: "Persta.AI",
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

export default async function AustraliaCollectionGuidePage() {
  await connection();

  // admin_only 期間中もプレビューできるよう includeAdminOnly で取得。
  const [category, allPresets] = await Promise.all([
    getPresetCategoryByKey(AUSTRALIA_KEY),
    listPublishedStylePresets({ includeAdminOnly: true }),
  ]);

  const threshold = category?.completionThreshold ?? 8;
  // sort_order 昇順(表紙 → Day1-2 → … → Day10)で取得済み。
  const presets = allPresets
    .filter((p) => p.category.key === AUSTRALIA_KEY)
    .map((p) => ({
      id: p.id,
      title: p.title,
      thumbnailImageUrl: p.thumbnailImageUrl,
    }));

  return <AustraliaTravelGuide threshold={threshold} presets={presets} />;
}

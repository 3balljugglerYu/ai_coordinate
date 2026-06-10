import type { Metadata } from "next";
import { connection } from "next/server";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";
import { WaferGuide } from "@/features/collections/components/WaferGuide";

// うちの子の神コレクション(6種)。mario(@mario335599)コラボ企画。
const WAFER_KEY = "collectible_wafer_sticker_god_6p";

const OGP_IMAGE = "/og/wafer-god.jpg";
const PAGE_TITLE = "うちの子の神コレクション｜6柱そろえてコンプリート | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子が神話の女神・神さまに。オーディン・ゼウス・イシス・アテナ・アルテミス・アフロディーテの全6種をあつめて、限定コンプリート台紙を完成させよう。ダウンロードして SNS でシェア！";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "うちの子の神コレクション｜6柱そろえてコンプリート",
    description:
      "うちの子を神話の女神に。全6種をあつめてコンプリート台紙をつくろう。",
    type: "website",
    siteName: "Persta.AI",
    images: [
      {
        url: OGP_IMAGE,
        width: 1200,
        height: 630,
        alt: "うちの子の神コレクション | Persta.AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "うちの子の神コレクション｜6柱そろえてコンプリート",
    description:
      "うちの子を神話の女神に。全6種をあつめてコンプリート台紙をつくろう。",
    images: [OGP_IMAGE],
  },
};

export default async function WaferCollectionGuidePage() {
  await connection();

  const category = await getPresetCategoryByKey(WAFER_KEY);
  const threshold = category?.completionThreshold ?? 6;
  const characterUrl = buildPublicGeneratedImageUrl(
    category?.collectionCharacterPath ?? null,
  );

  return <WaferGuide characterUrl={characterUrl} threshold={threshold} />;
}

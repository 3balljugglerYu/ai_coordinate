import type { Metadata } from "next";
import { connection } from "next/server";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";
import { WaferGuide } from "@/features/collections/components/WaferGuide";

const WAFER_KEY = "collectible_wafer_sticker";

export const metadata: Metadata = {
  title: "うちの子のウエハースシール｜あつめてコンプリート | Persta.AI",
  description:
    "うちの子が平成レトロなウエハースのおまけシールに。ちがう衣装をあつめると円が満ちて、そろえるとコンプリート台紙が完成。SNSでシェアしよう。",
  openGraph: {
    title: "うちの子のウエハースシール｜あつめてコンプリート",
    description: "うちの子をシール風に。あつめてコンプリート台紙をつくろう。",
    type: "website",
    siteName: "Persta.AI",
  },
};

export default async function WaferCollectionGuidePage() {
  await connection();

  const category = await getPresetCategoryByKey(WAFER_KEY);
  const threshold = category?.completionThreshold ?? 4;
  const characterUrl = buildPublicGeneratedImageUrl(
    category?.collectionCharacterPath ?? null,
  );

  return <WaferGuide characterUrl={characterUrl} threshold={threshold} />;
}

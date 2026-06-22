import type { Metadata } from "next";
import { connection } from "next/server";
import {
  CreatorsRecruitGuide,
  type GalleryImage,
} from "@/features/creators/components/CreatorsRecruitGuide";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";

const OGP_IMAGE = "/og/one-tap-style.png";
const PAGE_TITLE =
  "あなたのプロンプトを掲載しませんか？｜One-Tap Style クリエイター募集 | Persta.AI";
const PAGE_DESCRIPTION =
  "あなたが作ったプロンプトを Persta.AI の One-Tap Style に掲載。名前・アイコン付きで掲載され、全国のうちの子がワンタップで使えるように。生成プロンプトは非公開で保護。クリエイター募集中！";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "あなたのプロンプトを掲載しませんか？｜One-Tap Style クリエイター募集",
    description:
      "あなたのプロンプトを Persta.AI に掲載。名前・アイコン付きで全国のうちの子に使われ、プロンプトは非公開で守られます。",
    type: "website",
    siteName: "Persta.AI",
    images: [
      {
        url: OGP_IMAGE,
        width: 1200,
        height: 630,
        alt: "One-Tap Style クリエイター募集 | Persta.AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "あなたのプロンプトを掲載しませんか？｜One-Tap Style クリエイター募集",
    description:
      "あなたのプロンプトを Persta.AI に掲載。名前・アイコン付きで全国のうちの子に使われ、プロンプトは非公開で守られます。",
    images: [OGP_IMAGE],
  },
};

export default async function CreatorsRecruitPage() {
  await connection();

  // 現状 /style に登録されている公開プリセットのサムネをギャラリーに使う(常に最新)。
  const presets = await listPublishedStylePresets().catch(() => []);
  const galleryImages: GalleryImage[] = presets
    .filter((preset) => Boolean(preset.thumbnailImageUrl))
    .map((preset) => ({
      src: preset.thumbnailImageUrl,
      alt: preset.title || "One-Tap Style の作例",
    }));

  return <CreatorsRecruitGuide galleryImages={galleryImages} />;
}

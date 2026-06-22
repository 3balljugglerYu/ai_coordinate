import type { Metadata } from "next";
import { CreatorsRecruitGuide } from "@/features/creators/components/CreatorsRecruitGuide";

const OGP_IMAGE = "/og/one-tap-style.png";
const PAGE_TITLE =
  "あなたのコーデを掲載しませんか？｜One-Tap Style クリエイター募集 | Persta.AI";
const PAGE_DESCRIPTION =
  "あなたが作った“うちの子コーデ”を Persta.AI の One-Tap Style に掲載。名前・アイコン付きで掲載され、全国のうちの子がワンタップで着られるように。生成プロンプトは非公開で保護。クリエイター募集中！";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "あなたのコーデを掲載しませんか？｜One-Tap Style クリエイター募集",
    description:
      "あなたのコーデを Persta.AI に掲載。名前・アイコン付きで全国のうちの子に着られ、プロンプトは非公開で守られます。",
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
    title: "あなたのコーデを掲載しませんか？｜One-Tap Style クリエイター募集",
    description:
      "あなたのコーデを Persta.AI に掲載。名前・アイコン付きで全国のうちの子に着られ、プロンプトは非公開で守られます。",
    images: [OGP_IMAGE],
  },
};

export default function CreatorsRecruitPage() {
  return <CreatorsRecruitGuide />;
}

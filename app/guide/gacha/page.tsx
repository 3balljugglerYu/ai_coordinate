import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { isGachaPromptAvailable } from "@/lib/env";
import {
  createCanonicalAlternates,
  getDefaultOpenGraphImages,
  getDefaultTwitterImages,
} from "@/lib/metadata";
import { GachaGuide } from "@/features/guide/components/GachaGuide";

// ガチャ機能の紹介ページ。計画書: docs/planning/gacha-guide-page-plan.md
// ガチャ機能と同じ判定で出す(運営だけの間は、ほかの人には 404)。ガチャ機能を一般公開すると、
// このページも一緒に公開される。検索には出す(2026-10-05 決定。サイトマップへの追加は一般公開のとき)。

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("gachaGuide");
  const title = t("metaTitle");
  const description = t("metaDescription");
  // openGraph を書くと親の設定は丸ごと置き換わるので、既定の OGP 画像も入れ直す
  const images = getDefaultOpenGraphImages();
  const twitterImages = getDefaultTwitterImages();
  return {
    title: `${title} | Persta.AI`,
    description,
    alternates: createCanonicalAlternates("/guide/gacha"),
    openGraph: { title, description, type: "website", siteName: "Persta.AI", images },
    twitter: { card: "summary_large_image", title, description, images: twitterImages },
  };
}

export default async function GachaGuidePage() {
  await connection();
  const user = await getUser();
  if (!isGachaPromptAvailable(user?.id)) {
    notFound();
  }
  return <GachaGuide />;
}

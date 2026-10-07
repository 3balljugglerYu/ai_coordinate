import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { isNameInputAvailable } from "@/lib/env";
import {
  createCanonicalAlternates,
  getDefaultOpenGraphImages,
  getDefaultTwitterImages,
} from "@/lib/metadata";
import { TextGuide } from "@/features/guide/components/TextGuide";

// 文字入力の紹介ページ。計画書: docs/planning/name-input-slot-plan.md Phase 6
// 文字入力と同じ判定で出す(運営だけの間は、ほかの人には 404)。文字入力を一般公開すると、
// このページも一緒に公開される(ガチャの紹介ページと同じ作り)。

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("textGuide");
  const title = t("metaTitle");
  const description = t("metaDescription");
  // openGraph を書くと親の設定は丸ごと置き換わるので、既定の OGP 画像も入れ直す
  const images = getDefaultOpenGraphImages();
  const twitterImages = getDefaultTwitterImages();
  return {
    title: `${title} | Persta.AI`,
    description,
    alternates: createCanonicalAlternates("/guide/text"),
    openGraph: { title, description, type: "website", siteName: "Persta.AI", images },
    twitter: { card: "summary_large_image", title, description, images: twitterImages },
  };
}

export default async function TextGuidePage() {
  await connection();
  const user = await getUser();
  if (!isNameInputAvailable(user?.id)) {
    notFound();
  }
  return <TextGuide />;
}

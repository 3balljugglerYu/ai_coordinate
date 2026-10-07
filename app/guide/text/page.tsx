import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { isNameInputPubliclyEnabled } from "@/lib/env";
import {
  createCanonicalAlternates,
  getDefaultOpenGraphImages,
  getDefaultTwitterImages,
} from "@/lib/metadata";
import { TextGuide } from "@/features/guide/components/TextGuide";

// 文字入力の紹介ページ。計画書: docs/planning/name-input-slot-plan.md Phase 6
// URL を知っていれば誰でも見られる(2026-10-08 ユーザー決定。以前は運営だけ)。
// ただし文字入力を一般公開するまでは、検索に出さない(noindex・sitemap にも載せない)。

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
    // 文字入力を一般公開するまでは、検索エンジンに載せない
    ...(isNameInputPubliclyEnabled() ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function TextGuidePage() {
  // 表示する言語は閲覧者ごとに変わるので、リクエストごとに描く(ガチャの紹介ページと同じ)
  await connection();
  return <TextGuide />;
}

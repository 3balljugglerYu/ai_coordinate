import type { Metadata } from "next";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { FashionMagazineAutumnGuide } from "@/features/collections/components/FashionMagazineAutumnGuide";
import { SignupSourceCapture } from "@/features/auth/components/SignupSourceCapture";

// うちの子のファッション雑誌：秋(7ページ構成・book 完走ビュー)。
const FASHION_MAGAZINE_AUTUMN_KEY = "fashion_magazine_autumn";

const PAGE_TITLE =
  "うちの子のファッション雑誌 秋号｜7ページそろえて1冊完成 | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子が秋の誌面の主役に。表紙から裏表紙まで全7ページを生成すると、めくって読めるデジタル雑誌が完成。Xシェアで運営が選んだ1名にAmazonギフト券5,000円分。9/19〜9/25開催。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections/fashion-magazine-autumn"),
};

export default async function FashionMagazineAutumnGuidePage() {
  await connection();
  return (
    <>
      {/* この企画ページに着地した時点で流入元は確定している。X の投稿リンクに
          毎回手でタグを付けなくても、企画経由の登録を数えられるようにする。 */}
      <SignupSourceCapture fallbackSource={FASHION_MAGAZINE_AUTUMN_KEY} />
      <FashionMagazineAutumnGuide />
    </>
  );
}

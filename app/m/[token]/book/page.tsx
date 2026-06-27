import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getCollectionBookByToken } from "@/features/collections/lib/public-mount-server-api";
import type { CatalogPageData } from "@/features/catalog/components/CatalogPage";
import { ScrapbookReader } from "@/features/collections/components/ScrapbookReader";

interface BookPageProps {
  params: Promise<{ token: string }>;
}

const SHARE_DESCRIPTION =
  "うちの子の旅行日記(スクラップブック)。あなたのうちの子でも作れます。";

export async function generateMetadata({
  params,
}: BookPageProps): Promise<Metadata> {
  const { token } = await params;
  const book = await getCollectionBookByToken(token);
  const title = book
    ? `${book.displayNameJa} | Persta.AI`
    : "旅行日記 | Persta.AI";

  const base: Metadata = {
    title,
    description: SHARE_DESCRIPTION,
    robots: { index: false, follow: true },
  };
  if (!book || !book.ogpImageUrl) return base;

  return {
    ...base,
    openGraph: {
      title,
      description: SHARE_DESCRIPTION,
      type: "article",
      siteName: "Persta.AI",
      images: [{ url: book.ogpImageUrl, alt: title, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: SHARE_DESCRIPTION,
      images: [book.ogpImageUrl],
    },
  };
}

export default async function CollectionBookPage({ params }: BookPageProps) {
  await connection();
  const { token } = await params;
  const book = await getCollectionBookByToken(token);
  if (!book) {
    notFound();
  }

  const user = await getUser();
  const isOwner = Boolean(user && user.id === book.ownerId);

  // クレジット項目は渡さない(displayName 無し)= 画像のみのスクラップブックページ。
  const pages: CatalogPageData[] = book.pageImageUrls.map((url, i) => ({
    id: String(i),
    imageUrl: url,
    alt: null,
  }));

  return (
    <ScrapbookReader
      title={book.displayNameJa}
      coverImageUrl={book.coverImageUrl}
      pages={pages}
      isOwner={isOwner}
    />
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getCollectionBookByToken } from "@/features/collections/lib/public-mount-server-api";
import { composeBookPages } from "@/features/collections/lib/book-display";
import type { CatalogPageData } from "@/features/catalog/components/CatalogPage";
import { ScrapbookReader } from "@/features/collections/components/ScrapbookReader";
import {
  BOOK_SHARE_FALLBACK_TITLE,
  buildBookShareDescription,
} from "@/features/collections/lib/book-share-metadata";

interface BookPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ reward?: string }>;
}

export async function generateMetadata({
  params,
}: BookPageProps): Promise<Metadata> {
  const { token } = await params;
  const book = await getCollectionBookByToken(token);
  const title = book
    ? `${book.displayNameJa} | Persta.AI`
    : BOOK_SHARE_FALLBACK_TITLE;
  const description = buildBookShareDescription(book?.displayNameJa);

  const base: Metadata = {
    title,
    description,
    robots: { index: false, follow: true },
  };
  if (!book || !book.ogpImageUrl) return base;

  return {
    ...base,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Persta.AI",
      // OGP はユーザー生成の「はじまり(表紙)」= 縦長のため、横長1200x630の
      // サイズヒントは付けない(実寸はクローラーが画像から取得する)。
      images: [{ url: book.ogpImageUrl, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [book.ogpImageUrl],
    },
  };
}

export default async function CollectionBookPage({
  params,
  searchParams,
}: BookPageProps) {
  await connection();
  const { token } = await params;
  const book = await getCollectionBookByToken(token);
  if (!book) {
    notFound();
  }

  const user = await getUser();
  const isOwner = Boolean(user && user.id === book.ownerId);

  // 完走報酬の演出(?reward=N)。表示専用(付与はサーバー確定済み)のため値は
  // 常識的な範囲に丸め、他人のリンク共有で出ないよう所有者のみに限定する。
  const { reward } = await searchParams;
  const rewardRaw = Number.parseInt(reward ?? "", 10);
  const rewardGranted =
    isOwner && Number.isInteger(rewardRaw) && rewardRaw > 0
      ? Math.min(rewardRaw, 100000)
      : 0;

  // 表紙 / 中身 / 裏表紙の振り分け(カテゴリ設定依存)。詳細は composeBookPages 参照。
  const { coverImageUrl, bodyImageUrls, backCoverImageUrl } = composeBookPages({
    fixedCoverImageUrl: book.coverImageUrl,
    pageImageUrls: book.pageImageUrls,
    backCoverMode: book.backCoverMode,
  });

  // クレジット項目は渡さない(displayName 無し)= 画像のみのスクラップブックページ。
  const pages: CatalogPageData[] = bodyImageUrls.map((url, i) => ({
    id: String(i),
    imageUrl: url,
    alt: null,
  }));

  return (
    <ScrapbookReader
      title={book.displayNameJa}
      coverImageUrl={coverImageUrl}
      pages={pages}
      isOwner={isOwner}
      completionId={token}
      categoryKey={book.categoryKey}
      rewardGranted={rewardGranted}
      coverOverlay={book.coverOverlay}
      backCoverImageUrl={backCoverImageUrl}
      pageAspectRatio={book.pageAspectRatio}
      lottery={{
        categoryKey: book.categoryKey,
        lotteryTarget: book.lotteryTarget,
        entryStartsAt: book.collectionDisplayStartsAt,
        entryEndsAt: book.collectionDisplayEndsAt,
      }}
    />
  );
}

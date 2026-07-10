import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getCollectionBookByToken } from "@/features/collections/lib/public-mount-server-api";
import type { CatalogPageData } from "@/features/catalog/components/CatalogPage";
import { ScrapbookReader } from "@/features/collections/components/ScrapbookReader";

interface BookPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ reward?: string }>;
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
      // OGP はユーザー生成の「はじまり(表紙)」= 縦長のため、横長1200x630の
      // サイズヒントは付けない(実寸はクローラーが画像から取得する)。
      images: [{ url: book.ogpImageUrl, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: SHARE_DESCRIPTION,
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

  // 表紙(0ページ目)の決定:
  //   - 既定: コレクションの先頭(sort_order 最小)の生成画像=「ユーザー生成の表紙」を front cover にし、
  //     残りを中身ページにする(完走数 N は表紙を含む。例 travel_to_italy=9)。
  //   - book_cover_path(共通固定表紙)が設定されている場合のみ、それを front cover にし全ページを中身にする。
  const hasFixedCover = Boolean(book.coverImageUrl);
  const coverImageUrl = book.coverImageUrl ?? book.pageImageUrls[0] ?? null;
  const contentImageUrls = hasFixedCover
    ? book.pageImageUrls
    : book.pageImageUrls.slice(1);

  // クレジット項目は渡さない(displayName 無し)= 画像のみのスクラップブックページ。
  const pages: CatalogPageData[] = contentImageUrls.map((url, i) => ({
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
      rewardGranted={rewardGranted}
    />
  );
}

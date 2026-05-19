import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedCampaignBySlug,
  getCachedPublicEntriesByCampaign,
} from "@/features/catalog/lib/get-public-catalog";
import {
  createCatalogSignedUrl,
  createCatalogSignedUrls,
} from "@/features/catalog/lib/repository";
import { CatalogReaderLauncher } from "@/features/catalog/components/CatalogReaderLauncher";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCachedCampaignBySlug(slug);
  if (campaign == null) {
    return { title: "絵師カタログ | Persta.AI" };
  }

  let coverImageUrl: string | null = null;
  if (campaign.cover_storage_path) {
    const adminClient = createAdminClient();
    const { url } = await createCatalogSignedUrl(
      adminClient,
      campaign.cover_storage_path,
      SIGNED_URL_TTL_SECONDS,
    );
    coverImageUrl = url;
  }

  return {
    title: `${campaign.title} | 絵師カタログ | Persta.AI`,
    description:
      campaign.description ??
      `${campaign.title} - 絵師さんの作品をまとめた本です。`,
    openGraph: {
      title: campaign.title,
      description: campaign.description ?? undefined,
      type: "website",
      images: coverImageUrl ? [{ url: coverImageUrl }] : undefined,
    },
  };
}

/**
 * カタログのランディングページ。
 * 表紙プレビューをタップすると、全画面 Dialog でリーダーが開く (CatalogReaderLauncher 内部で制御)。
 * X 共有された /catalog/[slug]/p/[entryId] からも、同じ仕組みで Dialog が自動で開く。
 */
export default async function CatalogCampaignPage({ params }: PageProps) {
  await connection();
  const { slug } = await params;

  const campaign = await getCachedCampaignBySlug(slug);
  if (campaign == null) {
    notFound();
  }

  const entries = await getCachedPublicEntriesByCampaign(campaign.id, slug);

  // 画像 signed URL を発行 (リーダーで表示するため)
  const adminClient = createAdminClient();
  const paths = entries.map((e) => e.image_storage_path);
  const { urls } = await createCatalogSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS,
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const pages = entries.map((entry) => ({
    id: entry.id,
    imageUrl: pathToUrl.get(entry.image_storage_path) ?? null,
    alt: entry.alt,
    displayName: entry.display_name,
    xAccountUrl: entry.x_account_url,
    sourceTweetUrl: entry.source_tweet_url,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:pt-12">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/catalog" className="hover:underline">
            ← カタログ一覧へ戻る
          </Link>
        </nav>

        <h1 className="sr-only">{campaign.title}</h1>

        <CatalogReaderLauncher
          campaignSlug={campaign.slug}
          campaignTitle={campaign.title}
          campaignHashtag={campaign.theme_hashtag}
          campaignDescription={campaign.description}
          pages={pages}
        />

        {pages.length > 0 ? (
          <p
            className="mt-6 text-center text-sm italic text-stone-600"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            タップして本を開く →
          </p>
        ) : (
          <p
            className="mt-6 text-center text-sm text-stone-600"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            まだ公開された投稿はありません。
            <br />
            一番乗りで申請してみませんか?
          </p>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/catalog/submit?campaign=${campaign.slug}`}
            className="inline-flex items-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            この企画に作品を申請する
          </Link>
          <span className="text-xs text-slate-400">
            ※ 未ログインでも申請できます
          </span>
        </div>
      </div>
    </div>
  );
}

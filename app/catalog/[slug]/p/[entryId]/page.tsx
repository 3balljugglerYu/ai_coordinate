import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedCampaignBySlug,
  getCachedPublicEntriesByCampaign,
  getCachedPublicEntryById,
} from "@/features/catalog/lib/get-public-catalog";
import {
  createCatalogSignedUrl,
  createCatalogSignedUrls,
} from "@/features/catalog/lib/repository";
import { CatalogReaderLauncher } from "@/features/catalog/components/CatalogReaderLauncher";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

interface PageProps {
  params: Promise<{ slug: string; entryId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, entryId } = await params;
  const [campaign, entry] = await Promise.all([
    getCachedCampaignBySlug(slug),
    getCachedPublicEntryById(entryId),
  ]);
  if (campaign == null || entry == null) {
    return { title: "絵師カタログ | Persta.AI" };
  }
  const title = `${entry.display_name} - ${campaign.title} | 絵師カタログ`;
  const description =
    entry.alt ??
    `${campaign.title} に投稿された ${entry.display_name} さんの作品です。`;

  const adminClient = createAdminClient();
  const { url: ogImageUrl } = await createCatalogSignedUrl(
    adminClient,
    entry.image_storage_path,
    SIGNED_URL_TTL_SECONDS,
  );

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: ogImageUrl ? [{ url: ogImageUrl }] : undefined,
    },
  };
}

/**
 * 個別ページの直リンク。X 共有 URL の着地点。
 *
 * ランディング (/catalog/[slug]) と同じ構成だが、CatalogReaderLauncher を
 * initialOpen=true + 指定 entryId で起動し、開いた状態でリーダーが立ち上がる。
 * 閉じるボタンで /catalog/[slug] に遷移する。
 */
export default async function CatalogEntryDirectLinkPage({ params }: PageProps) {
  await connection();
  const { slug, entryId } = await params;

  const campaign = await getCachedCampaignBySlug(slug);
  if (campaign == null) {
    notFound();
  }

  const entry = await getCachedPublicEntryById(entryId);
  if (entry == null || entry.campaign_id !== campaign.id) {
    notFound();
  }

  const entries = await getCachedPublicEntriesByCampaign(campaign.id, slug);

  const adminClient = createAdminClient();
  const paths = entries.map((e) => e.image_storage_path);
  const { urls } = await createCatalogSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS,
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const pages = entries.map((e) => ({
    id: e.id,
    imageUrl: pathToUrl.get(e.image_storage_path) ?? null,
    alt: e.alt,
    displayName: e.display_name,
    xAccountUrl: e.x_account_url,
    sourceTweetUrl: e.source_tweet_url,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:pt-12">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/catalog" className="hover:underline">
            ← カタログ一覧へ戻る
          </Link>
        </nav>

        <h1 className="sr-only">
          {entry.display_name} - {campaign.title}
        </h1>

        <CatalogReaderLauncher
          campaignSlug={campaign.slug}
          campaignTitle={campaign.title}
          campaignHashtag={campaign.theme_hashtag}
          campaignDescription={campaign.description}
          pages={pages}
          initialOpen
          initialEntryId={entry.id}
        />

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

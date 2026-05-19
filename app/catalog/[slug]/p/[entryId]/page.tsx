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
import { CatalogBookView } from "@/features/catalog/components/CatalogBookView";

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

  // 同企画の全エントリーを取得 (本めくり UI で前後にめくれるように)
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

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:pt-16">
        <nav className="mb-4 text-sm text-slate-500">
          <Link href={`/catalog/${campaign.slug}`} className="hover:underline">
            ← {campaign.title} に戻る
          </Link>
        </nav>
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {entry.display_name} - {campaign.title}
          </h1>
        </header>
        <CatalogBookView
          campaignTitle={campaign.title}
          campaignHashtag={campaign.theme_hashtag}
          campaignDescription={campaign.description}
          pages={entries.map((e) => ({
            id: e.id,
            imageUrl: pathToUrl.get(e.image_storage_path) ?? null,
            alt: e.alt,
            displayName: e.display_name,
            xAccountUrl: e.x_account_url,
            sourceTweetUrl: e.source_tweet_url,
          }))}
          initialEntryId={entry.id}
        />
      </div>
    </div>
  );
}

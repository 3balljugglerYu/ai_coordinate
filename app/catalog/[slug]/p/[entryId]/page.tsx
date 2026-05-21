import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
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
import { CatalogReaderModal } from "@/features/catalog/components/CatalogReaderModal";

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
 * /catalog/[slug] と同じ固定高さレイアウトで、本を該当エントリーから開いた状態で表示する。
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
    <div className="h-[100dvh] overflow-hidden bg-slate-50">
      <h1 className="sr-only">
        {entry.display_name} - {campaign.title}
      </h1>
      <CatalogReaderModal
        campaignSlug={campaign.slug}
        campaignTitle={campaign.title}
        campaignHashtag={campaign.theme_hashtag}
        campaignDescription={campaign.description}
        pages={pages}
        initialEntryId={entry.id}
        closeRedirectTo="/catalog"
      />
    </div>
  );
}

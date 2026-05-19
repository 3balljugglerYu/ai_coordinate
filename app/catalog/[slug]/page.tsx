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
import { CatalogBookView } from "@/features/catalog/components/CatalogBookView";

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

export default async function CatalogCampaignPage({ params }: PageProps) {
  await connection();
  const { slug } = await params;

  const campaign = await getCachedCampaignBySlug(slug);
  if (campaign == null) {
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

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:pt-16">
        <nav className="mb-4 text-sm text-slate-500">
          <Link href="/catalog" className="hover:underline">
            ← カタログ一覧へ戻る
          </Link>
        </nav>
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {campaign.title}
          </h1>
          {campaign.theme_hashtag ? (
            <p className="text-sm text-blue-600">
              X ハッシュタグ: #{campaign.theme_hashtag}
            </p>
          ) : null}
          {campaign.description ? (
            <p className="text-slate-600">{campaign.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              href={`/catalog/submit?campaign=${campaign.slug}`}
              className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              この企画に作品を申請する
            </Link>
            <span className="text-xs text-slate-400">
              ※ 未ログインでも申請できます
            </span>
          </div>
        </header>

        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
            まだ公開された投稿はありません。一番乗りで申請してみませんか?
          </p>
        ) : (
          <CatalogBookView
            campaignTitle={campaign.title}
            campaignHashtag={campaign.theme_hashtag}
            campaignDescription={campaign.description}
            pages={entries.map((entry) => ({
              id: entry.id,
              imageUrl: pathToUrl.get(entry.image_storage_path) ?? null,
              alt: entry.alt,
              displayName: entry.display_name,
              xAccountUrl: entry.x_account_url,
              sourceTweetUrl: entry.source_tweet_url,
            }))}
          />
        )}
      </div>
    </div>
  );
}

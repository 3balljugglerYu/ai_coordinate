import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createLocaleAlternates } from "@/lib/metadata";
import {
  getCachedCampaignBySlug,
  getCachedPublicEntriesByCampaign,
} from "@/features/catalog/lib/get-public-catalog";
import {
  createCatalogSignedUrl,
  createCatalogSignedUrls,
} from "@/features/catalog/lib/repository";
import { CatalogReaderModal } from "@/features/catalog/components/CatalogReaderModal";

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

  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return {
    title: `${campaign.title} | 絵師カタログ | Persta.AI`,
    description:
      campaign.description ??
      `${campaign.title} - 絵師さんの作品をまとめた本です。`,
    alternates: createLocaleAlternates(`/catalog/${slug}`, locale),
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
 * pages がある場合は CatalogReaderModal をマウントし、全画面リーダーが
 * front cover (表紙) から開いた状態で表示される。閉じると /catalog へ戻る。
 * X 共有された /catalog/[slug]/p/[entryId] からは、同じリーダーが該当ページから開く。
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

  // front cover 用に、カタログ一覧と同じ campaign カバー画像も signed URL 化する
  let campaignCoverImageUrl: string | null = null;
  if (campaign.cover_storage_path) {
    const { url } = await createCatalogSignedUrl(
      adminClient,
      campaign.cover_storage_path,
      SIGNED_URL_TTL_SECONDS,
    );
    campaignCoverImageUrl = url;
  }

  const pages = entries.map((entry) => ({
    id: entry.id,
    imageUrl: pathToUrl.get(entry.image_storage_path) ?? null,
    alt: entry.alt,
    displayName: entry.display_name,
    xAccountUrl: entry.x_account_url,
    sourceTweetUrl: entry.source_tweet_url,
  }));

  // pages がある場合はマウント時に Modal が auto-open。閉じる → /catalog へ。
  // pages が空の場合はランディング相当の Empty state を表示する。
  if (pages.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-slate-50 lg:h-[100dvh]">
        <nav className="flex shrink-0 items-center px-4 py-2 text-sm text-slate-500">
          <Link href="/catalog" className="hover:underline">
            ← カタログ一覧へ戻る
          </Link>
        </nav>
        <h1 className="sr-only">{campaign.title}</h1>
        <main className="flex flex-1 items-center justify-center overflow-hidden px-6 text-center">
          <p
            className="text-sm text-stone-600"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            まだ公開された投稿はありません。
            <br />
            一番乗りで申請してみませんか?
          </p>
        </main>
        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 py-3">
          <Link
            href={`/catalog/submit?campaign=${campaign.slug}`}
            className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            この企画に作品を申請する
          </Link>
          <span className="text-xs text-slate-400">
            ※ 未ログインでも申請できます
          </span>
        </footer>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50">
      <h1 className="sr-only">{campaign.title}</h1>
      <CatalogReaderModal
        campaignSlug={campaign.slug}
        campaignTitle={campaign.title}
        campaignHashtag={campaign.theme_hashtag}
        campaignDescription={campaign.description}
        campaignCoverImageUrl={campaignCoverImageUrl}
        pages={pages}
        closeRedirectTo="/catalog"
      />
    </div>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedPublishedCampaigns } from "@/features/catalog/lib/get-public-catalog";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";
import { CampaignCard } from "@/features/catalog/components/CampaignCard";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

export const metadata: Metadata = {
  title: "絵師カタログ | Persta.AI",
  description:
    "X で活動するクリエイターさんの作品を、企画ごとの本としてまとめて楽しめるカタログです。",
  openGraph: {
    title: "絵師カタログ | Persta.AI",
    description:
      "X で活動するクリエイターさんの作品を、企画ごとの本としてまとめて楽しめるカタログです。",
    type: "website",
  },
};

export default async function CatalogIndexPage() {
  await connection();

  const campaigns = await getCachedPublishedCampaigns();

  const adminClient = createAdminClient();
  const coverPaths = campaigns
    .map((c) => c.cover_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const { urls } = await createCatalogSignedUrls(
    adminClient,
    coverPaths,
    SIGNED_URL_TTL_SECONDS,
  );
  const pathToUrl = new Map<string, string | null>();
  coverPaths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:pt-16">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            絵師カタログ
          </h1>
          <p className="text-slate-600">
            企画ごとにまとめた、X 上の絵師さんたちの作品集です。気になったページから、絵師さんの X アカウントに飛べます。
          </p>
        </header>

        {campaigns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
            まだ公開中の企画はありません。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                slug={campaign.slug}
                title={campaign.title}
                description={campaign.description}
                themeHashtag={campaign.theme_hashtag}
                coverImageUrl={
                  campaign.cover_storage_path != null
                    ? pathToUrl.get(campaign.cover_storage_path) ?? null
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

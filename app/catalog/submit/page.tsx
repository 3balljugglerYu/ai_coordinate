import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { env, isCatalogFeatureEnabled } from "@/lib/env";
import { getCachedCampaignBySlug } from "@/features/catalog/lib/get-public-catalog";
import { CatalogSubmissionForm } from "@/features/catalog/components/CatalogSubmissionForm";

export const metadata: Metadata = {
  title: "作品を申請する | 絵師カタログ | Persta.AI",
  description:
    "X で活動するクリエイターさん向けの、絵師カタログ申請フォームです。未ログインでも申請できます。",
};

interface PageProps {
  searchParams: Promise<{ campaign?: string }>;
}

export default async function CatalogSubmitPage({ searchParams }: PageProps) {
  await connection();

  if (!isCatalogFeatureEnabled()) {
    notFound();
  }

  const { campaign: campaignSlug } = await searchParams;
  if (!campaignSlug) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16">
        <h1 className="text-2xl font-bold text-slate-900">
          申請する企画を選んでください
        </h1>
        <p className="mt-2 text-slate-600">
          まず{" "}
          <Link href="/catalog" className="text-blue-600 underline">
            カタログ一覧
          </Link>{" "}
          から参加したい企画を選び、その企画の「申請する」ボタンから移動してください。
        </p>
      </div>
    );
  }

  const campaign = await getCachedCampaignBySlug(campaignSlug);
  if (!campaign) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-10 sm:pt-16">
        <nav className="mb-4 text-sm text-slate-500">
          <Link
            href={`/catalog/${campaign.slug}`}
            className="hover:underline"
          >
            ← {campaign.title} に戻る
          </Link>
        </nav>
        <CatalogSubmissionForm
          campaignSlug={campaign.slug}
          campaignTitle={campaign.title}
          turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
        />
      </div>
    </div>
  );
}

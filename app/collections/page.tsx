import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/env";
import { getPublicCollectionSeriesCatalog } from "@/features/collections/lib/collection-catalog-repository";
import { getCollectionProgressForUser } from "@/features/collections/lib/collection-progress-repository";
import { buildCollectionCatalogView } from "@/features/collections/lib/collection-catalog-view";
import { CollectionCatalogGrid } from "@/features/collections/components/CollectionCatalogGrid";
import { createCanonicalAlternates } from "@/lib/metadata";

const OGP_IMAGE = "/og/wafer-god.jpg";
const PAGE_TITLE = "コレクション図鑑｜うちの子で集めよう | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子で楽しめるコレクション一覧。集めてコンプリートカードを完成させ、SNS でシェアしよう。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections"),
  openGraph: {
    title: "コレクション図鑑｜うちの子で集めよう",
    description: "うちの子で楽しめるコレクション一覧。集めてコンプリートしよう。",
    type: "website",
    siteName: "Persta.AI",
    images: [
      { url: OGP_IMAGE, width: 1200, height: 630, alt: "コレクション | Persta.AI" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "コレクション図鑑｜うちの子で集めよう",
    description: "うちの子で楽しめるコレクション一覧。集めてコンプリートしよう。",
    images: [OGP_IMAGE],
  },
};

export default async function CollectionsIndexPage() {
  await connection();

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    // 取得失敗はゲスト扱い(図鑑は匿名でも閲覧可能)
  }

  const localeValue = await getLocale();
  const locale = localeValue === "en" ? "en" : "ja";

  const [catalog, progress] = await Promise.all([
    getPublicCollectionSeriesCatalog(),
    userId
      ? getCollectionProgressForUser(userId, isAdminViewer(userId))
      : Promise.resolve([]),
  ]);

  const entries = buildCollectionCatalogView(catalog, progress);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">
          {locale === "en" ? "Collections" : "コレクション図鑑"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {locale === "en"
            ? "Collect outfits for your character and complete each card."
            : "うちの子で集めて、コンプリートカードを完成させよう。"}
        </p>
      </header>
      <CollectionCatalogGrid entries={entries} locale={locale} />
    </main>
  );
}

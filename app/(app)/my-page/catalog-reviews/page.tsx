import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { OwnCatalogReviewList } from "@/features/catalog-references/components/OwnCatalogReviewList";
export default async function CatalogReviewsPage({searchParams}:{searchParams:Promise<{image?:string|string[]}>}){
  await connection();await requireAuth();
  const params=await searchParams;
  const imageId=typeof params.image === "string" ? params.image : undefined;
  const t=await getTranslations("catalogReview");
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6"><h1 className="text-2xl font-bold">{t("title")}</h1><OwnCatalogReviewList imageId={imageId}/></main>;
}

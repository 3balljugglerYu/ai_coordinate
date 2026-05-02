import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStyleTemplateSignedUrls,
  listVisibleStyleTemplates,
} from "@/features/inspire/lib/repository";
import {
  HomeUserStyleTemplateCarousel,
  type HomeUserStyleTemplateCardData,
} from "./HomeUserStyleTemplateCarousel";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * ホーム用のユーザー投稿スタイルカルーセル（visible のみ）を取得し、
 * クライアントカルーセルへ渡す。
 *
 * 注: マウントの可否は app/[locale]/page.tsx 側で env フラグ
 * NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED により制御する（ADR-013）。
 */
export async function CachedHomeUserStyleTemplateSection() {
  const adminClient = createAdminClient();
  const { data, error } = await listVisibleStyleTemplates(adminClient, {
    limit: 30,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  // signed URL を一括発行（レビュー指摘 #5）
  const paths = data
    .map((row) => row.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const { urls } = await createStyleTemplateSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const templates: HomeUserStyleTemplateCardData[] = data.map((row) => ({
    id: row.id,
    alt: row.alt,
    image_url: row.storage_path ? pathToUrl.get(row.storage_path) ?? null : null,
  }));

  return <HomeUserStyleTemplateCarousel templates={templates} />;
}

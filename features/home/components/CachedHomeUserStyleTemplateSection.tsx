import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStyleTemplateSignedUrl,
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

  const templates: HomeUserStyleTemplateCardData[] = await Promise.all(
    data.map(async (row) => {
      let signedUrl: string | null = null;
      if (row.storage_path) {
        const result = await createStyleTemplateSignedUrl(
          adminClient,
          row.storage_path,
          SIGNED_URL_TTL_SECONDS
        );
        signedUrl = result.url;
      }
      return {
        id: row.id,
        alt: row.alt,
        image_url: signedUrl,
      };
    })
  );

  return <HomeUserStyleTemplateCarousel templates={templates} />;
}

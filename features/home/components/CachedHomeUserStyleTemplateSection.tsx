import { cacheLife, cacheTag } from "next/cache";
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
 * Phase 6 で実 use cache 化 (= 計画書 v2 CR-002 対応):
 *   - これまで revalidateTag("home-user-style-templates") を承認/撤回時に呼んでいたが、
 *     当該 Server Component が use cache 化されていなかったため、invalidate 対象が宙吊りだった。
 *   - 本コンポーネントを use cache 化し、cacheTag("home-user-style-templates") を立てる。
 *   - cacheLife("minutes"): signed URL TTL (= 30 分) との整合性を取りつつ、
 *     既存 CachedHomeBannerSection と同じ "minutes" preset を採用。
 *
 * 注:
 *   - admin / 一般ユーザーで内容を出し分ける必要は **無い** (= 全員に visible 行のみ見せる)。
 *     よって "use cache: private" は不要 (= グローバルキャッシュで共有して OK)。
 *   - Creator Looks 投稿のバッジ表示は is_creator_looks フラグを含めて Client に渡す
 *     (Phase 6 で repository → 本ファイル → Carousel まで配線済み)。
 *   - マウントの可否は app/[locale]/page.tsx 側で env フラグ
 *     NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED により制御する（ADR-013）。
 */
export async function CachedHomeUserStyleTemplateSection() {
  "use cache";
  cacheTag("home-user-style-templates");
  cacheLife("minutes");

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
    is_creator_looks: row.is_creator_looks === true,
  }));

  return <HomeUserStyleTemplateCarousel templates={templates} />;
}

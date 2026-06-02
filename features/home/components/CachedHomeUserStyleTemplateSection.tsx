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
 * Phase 8 で消費側 gating を追加 (= Stage 1 厳密化):
 *   - includeCreatorLooks=false (= 一般ユーザー向け): Creator Looks 投稿を完全に除外
 *   - includeCreatorLooks=true (= admin / allowlist 向け): Creator Looks 投稿を含む
 *   - use cache の引数として渡すため、2 種類の cache エントリができる (= per-user cache ではない)
 *   - admin 判定そのものはページ側 (= cookies/headers を読める Server Component) で行い、
 *     boolean フラグで渡す
 *
 * 注:
 *   - マウントの可否は app/[locale]/page.tsx 側で env フラグ
 *     NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED により制御する（ADR-013）。
 */
export async function CachedHomeUserStyleTemplateSection({
  includeCreatorLooks = false,
}: {
  /**
   * Creator Looks 投稿をカルーセルに含めるか。
   * デフォルト false (= Stage 1 厳密化、一般ユーザー向け)。
   * page 側で `isCreatorLooksEnabledForUser(user)` の結果を渡す。
   */
  includeCreatorLooks?: boolean;
} = {}) {
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

  // includeCreatorLooks=false なら Creator Looks 投稿を完全に除外 (= Stage 1 厳密化)
  const filteredData = includeCreatorLooks
    ? data
    : data.filter((row) => row.is_creator_looks !== true);

  if (filteredData.length === 0) {
    return null;
  }

  // signed URL を一括発行（レビュー指摘 #5）
  const paths = filteredData
    .map((row) => row.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const { urls } = await createStyleTemplateSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const templates: HomeUserStyleTemplateCardData[] = filteredData.map((row) => ({
    id: row.id,
    alt: row.alt,
    image_url: row.storage_path ? pathToUrl.get(row.storage_path) ?? null : null,
    is_creator_looks: row.is_creator_looks === true,
  }));

  return <HomeUserStyleTemplateCarousel templates={templates} />;
}

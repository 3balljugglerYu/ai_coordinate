/**
 * 絵師カタログ機能の DB アクセス層
 *
 * - 公開閲覧は catalog_public_entries view 経由 (PII を返さない)
 * - 書き込み (投稿・承認・順序更新) は service-role client 経由
 * - 詳細は docs/planning/user-catalog-implementation-plan.md (ADR-008) 参照
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogCampaignStatus = "draft" | "published";
export type CatalogEntryStatus = "pending" | "approved" | "rejected";

export interface CatalogCampaignRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_storage_path: string | null;
  theme_hashtag: string | null;
  start_at: string | null;
  end_at: string | null;
  status: CatalogCampaignStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CatalogPublicEntryRow {
  id: string;
  campaign_id: string;
  display_name: string;
  x_account_url: string;
  source_tweet_url: string;
  image_storage_path: string;
  alt: string | null;
  display_order: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

const CAMPAIGN_FIELDS = `
  id,
  slug,
  title,
  description,
  cover_storage_path,
  theme_hashtag,
  start_at,
  end_at,
  status,
  display_order,
  created_at,
  updated_at
` as const;

const PUBLIC_ENTRY_FIELDS = `
  id,
  campaign_id,
  display_name,
  x_account_url,
  source_tweet_url,
  image_storage_path,
  alt,
  display_order,
  approved_at,
  created_at,
  updated_at
` as const;

// ===============================================
// 公開閲覧 (anon でアクセス可)
// ===============================================

/**
 * 公開中の企画一覧。display_order 昇順、作成日降順。
 */
export async function listPublishedCampaigns(
  client: SupabaseClient,
  options: { limit?: number } = {},
): Promise<{
  data: CatalogCampaignRow[] | null;
  error: { message: string } | null;
}> {
  const { limit = 100 } = options;
  const { data, error } = await client
    .from("catalog_campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  return {
    data: (data as CatalogCampaignRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * slug で個別企画を取得 (published のみ)。
 */
export async function getPublishedCampaignBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<{
  data: CatalogCampaignRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("catalog_campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return {
    data: (data as CatalogCampaignRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * 公開エントリー一覧 (catalog_public_entries view 経由)。
 * view は status='approved' かつ親 campaign が published のみを返す。
 */
export async function listPublicEntriesByCampaignId(
  client: SupabaseClient,
  campaignId: string,
  options: { limit?: number } = {},
): Promise<{
  data: CatalogPublicEntryRow[] | null;
  error: { message: string } | null;
}> {
  const { limit = 300 } = options;
  const { data, error } = await client
    .from("catalog_public_entries")
    .select(PUBLIC_ENTRY_FIELDS)
    .eq("campaign_id", campaignId)
    .order("display_order", { ascending: true })
    .order("approved_at", { ascending: false })
    .limit(limit);

  return {
    data: (data as CatalogPublicEntryRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * 個別エントリー (id 指定、view 経由)。共有 URL から OG 情報を組む際に使う。
 */
export async function getPublicEntryById(
  client: SupabaseClient,
  entryId: string,
): Promise<{
  data: CatalogPublicEntryRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("catalog_public_entries")
    .select(PUBLIC_ENTRY_FIELDS)
    .eq("id", entryId)
    .maybeSingle();

  return {
    data: (data as CatalogPublicEntryRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

// ===============================================
// Storage signed URL (TTL 付き、cache 対象外)
// ===============================================

const CATALOG_BUCKET = "catalog-images";

/**
 * カタログ画像の Storage 変換オプション。
 *
 * 元画像はアップロードされたまま (リサイズ・形式変換なし) 保存されており、
 * 数 MB の PNG/JPEG になりがち (実測: 表紙 2160×3840 の PNG で約 8MB)。
 * Supabase Storage の画像変換でリサイズ + 再エンコードして配信する。
 * 変換エンドポイントは Accept ヘッダに応じて WebP を返すため、対応ブラウザ
 * では自動的に WebP 配信になる (実測: 約 8MB PNG → 約 0.22MB WebP)。
 *
 * width はモバイル等倍 (約 366px) の高 DPI 表示に十分な値。
 * resize: "contain" + height 未指定で、アスペクト比を保ったまま横幅基準で
 * 縮小される (resize 省略時は横だけ縮んで縦横比が崩れるため必須)。
 */
const CATALOG_IMAGE_TRANSFORM = {
  width: 1280,
  resize: "contain",
  quality: 80,
} as const;

/**
 * 単一の Storage パスから signed URL を発行する (画像変換付き)。
 *
 * @param expiresInSeconds 有効期限秒数。デフォルト 30 分。Cache Components 化したメタデータの TTL より長くすること。
 */
export async function createCatalogSignedUrl(
  client: SupabaseClient,
  storagePath: string,
  expiresInSeconds: number = 1800,
): Promise<{ url: string | null; error: { message: string } | null }> {
  const { data, error } = await client.storage
    .from(CATALOG_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, {
      transform: CATALOG_IMAGE_TRANSFORM,
    });

  return {
    url: data?.signedUrl ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * 複数の Storage パスから signed URL を一括発行する (画像変換付き)。
 *
 * バッチ API (createSignedUrls) は画像変換に非対応のため、変換付き URL は
 * createSignedUrl を path ごとに発行する。多数のリクエストが同時に飛ばないよう
 * 一定数ずつに区切って並列実行する。
 *
 * 戻り値: 入力 paths と同順の signed URL 配列。失敗したエントリは null。
 */
export async function createCatalogSignedUrls(
  client: SupabaseClient,
  storagePaths: ReadonlyArray<string>,
  expiresInSeconds: number = 1800,
): Promise<{
  urls: Array<string | null>;
  error: { message: string } | null;
}> {
  if (storagePaths.length === 0) {
    return { urls: [], error: null };
  }

  const CHUNK_SIZE = 16;
  const urls: Array<string | null> = [];
  for (let i = 0; i < storagePaths.length; i += CHUNK_SIZE) {
    const chunk = storagePaths.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((path) =>
        client.storage
          .from(CATALOG_BUCKET)
          .createSignedUrl(path, expiresInSeconds, {
            transform: CATALOG_IMAGE_TRANSFORM,
          }),
      ),
    );
    for (const result of results) {
      urls.push(result.data?.signedUrl ?? null);
    }
  }
  return { urls, error: null };
}

/**
 * Inspire 機能の DB アクセス層
 *
 * RLS をバイパスして全状態を扱う必要がある操作（admin 一覧、cleanup、署名 URL 発行など）は
 * service-role クライアントを受け取って動作する。クライアントは呼出側で制御する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type StyleTemplateModerationStatus =
  | "draft"
  | "pending"
  | "visible"
  | "removed"
  | "withdrawn";

export interface UserStyleTemplateRow {
  id: string;
  submitted_by_user_id: string;
  image_url: string | null;
  storage_path: string | null;
  alt: string | null;
  moderation_status: StyleTemplateModerationStatus;
  moderation_reason: string | null;
  moderation_updated_at: string | null;
  moderation_approved_at: string | null;
  moderation_decided_by: string | null;
  copyright_consent_at: string | null;
  preview_openai_image_url: string | null;
  preview_gemini_image_url: string | null;
  preview_generated_at: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_BASE_FIELDS = `
  id,
  submitted_by_user_id,
  image_url,
  storage_path,
  alt,
  moderation_status,
  moderation_reason,
  moderation_updated_at,
  moderation_approved_at,
  moderation_decided_by,
  copyright_consent_at,
  preview_openai_image_url,
  preview_gemini_image_url,
  preview_generated_at,
  display_order,
  created_at,
  updated_at
` as const;

/**
 * ホームカルーセル / 公開 GET API 用: visible 行のみを取得
 */
export async function listVisibleStyleTemplates(
  client: SupabaseClient,
  options: { limit?: number } = {}
): Promise<{
  data: UserStyleTemplateRow[] | null;
  error: { message: string } | null;
}> {
  const { limit = 50 } = options;
  const { data, error } = await client
    .from("user_style_templates")
    .select(TEMPLATE_BASE_FIELDS)
    .eq("moderation_status", "visible")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  return {
    data: (data as UserStyleTemplateRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * ID 単体取得（admin 詳細パネル / 利用者詳細画面で利用）
 */
export async function getStyleTemplateById(
  client: SupabaseClient,
  id: string
): Promise<{
  data: UserStyleTemplateRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("user_style_templates")
    .select(TEMPLATE_BASE_FIELDS)
    .eq("id", id)
    .maybeSingle();

  return {
    data: (data as UserStyleTemplateRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * 申請者の active 件数（pending + visible）を数える。cap (5 件) チェックに使用。
 */
export async function countActiveSubmissionsForUser(
  client: SupabaseClient,
  userId: string
): Promise<{ count: number; error: { message: string } | null }> {
  const { count, error } = await client
    .from("user_style_templates")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by_user_id", userId)
    .in("moderation_status", ["pending", "visible"]);

  return {
    count: count ?? 0,
    error: error ? { message: error.message } : null,
  };
}

/**
 * 申請者本人の自分のテンプレート一覧（全状態）
 */
export async function listOwnStyleTemplates(
  client: SupabaseClient,
  userId: string
): Promise<{
  data: UserStyleTemplateRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("user_style_templates")
    .select(TEMPLATE_BASE_FIELDS)
    .eq("submitted_by_user_id", userId)
    .order("created_at", { ascending: false });

  return {
    data: (data as UserStyleTemplateRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * Admin 用一覧（status filter）
 */
export async function listStyleTemplatesByStatus(
  client: SupabaseClient,
  status: StyleTemplateModerationStatus,
  options: { limit?: number; offset?: number } = {}
): Promise<{
  data: UserStyleTemplateRow[] | null;
  error: { message: string } | null;
}> {
  const { limit = 50, offset = 0 } = options;
  const { data, error } = await client
    .from("user_style_templates")
    .select(TEMPLATE_BASE_FIELDS)
    .eq("moderation_status", status)
    .order(status === "visible" ? "display_order" : "created_at", {
      ascending: status === "visible",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    data: (data as UserStyleTemplateRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * Storage の内部パス（service-role でのみアクセス可能な private bucket）から
 * 短期署名 URL を発行する。単発取得用。
 *
 * @param expiresInSeconds 有効期限。デフォルトは 30 分。Cache Components 化する場合は cache TTL より長くすること。
 */
export async function createStyleTemplateSignedUrl(
  client: SupabaseClient,
  storagePath: string,
  expiresInSeconds: number = 1800
): Promise<{ url: string | null; error: { message: string } | null }> {
  const { data, error } = await client.storage
    .from("style-templates")
    .createSignedUrl(storagePath, expiresInSeconds);

  return {
    url: data?.signedUrl ?? null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * 複数の Storage パスから signed URL を一括発行する。
 *
 * 行ごとに createSignedUrl を await すると admin 一覧 (limit=200) で 200×3=600 回の
 * HTTP コールになるため、createSignedUrls を使う（レビュー指摘 #5）。
 *
 * 戻り値: 入力 paths と同順の signed URL 配列。失敗したエントリは null。
 */
export async function createStyleTemplateSignedUrls(
  client: SupabaseClient,
  storagePaths: ReadonlyArray<string>,
  expiresInSeconds: number = 1800
): Promise<{
  urls: Array<string | null>;
  error: { message: string } | null;
}> {
  if (storagePaths.length === 0) {
    return { urls: [], error: null };
  }
  const { data, error } = await client.storage
    .from("style-templates")
    .createSignedUrls([...storagePaths], expiresInSeconds);

  if (error || !data) {
    return {
      urls: storagePaths.map(() => null),
      error: error ? { message: error.message } : null,
    };
  }

  // createSignedUrls の戻り値は entries の配列（path, signedUrl, error）。
  // path 順に並ぶ前提で実装されているが、明示的に path -> url のマップを作って
  // 入力順に合わせて返す（API の保守性のため）。
  const map = new Map<string, string | null>();
  for (const entry of data) {
    if (entry.path) {
      map.set(entry.path, entry.signedUrl ?? null);
    }
  }
  return {
    urls: storagePaths.map((p) => map.get(p) ?? null),
    error: null,
  };
}

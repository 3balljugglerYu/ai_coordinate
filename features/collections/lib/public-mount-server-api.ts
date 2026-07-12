import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const GENERATED_IMAGES_BUCKET = "generated-images";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** generated-images(public バケット)の保存パスから公開URLを組み立てる */
export function buildPublicGeneratedImageUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${GENERATED_IMAGES_BUCKET}/${path}`;
}

// X(Twitter)等はカード画像を og:image の URL 単位でキャッシュし、手動パージ手段が無い。
// Storage 実体を同一パスへ上書きした場合はこの版数を上げて URL を変え、再取得させる。
const OGP_IMAGE_VERSION = 2;

/** og:image 用 URL にキャッシュバスター(?v=N)を付与する */
export function withOgpVersion(url: string): string;
export function withOgpVersion(url: string | null): string | null;
export function withOgpVersion(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("v", String(OGP_IMAGE_VERSION));
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface PublicMount {
  completionId: string;
  ownerId: string;
  categoryKey: string;
  displayNameJa: string;
  displayNameEn: string;
  mountImageUrl: string;
  completedAt: string | null;
  /** 台紙テンプレ実寸(px)。表示アスペクト算出用。無ければ null */
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
  /** Xシェア抽選プレゼントの対象カテゴリか(admin 設定)。応募ボタンの表示判定に使う。 */
  lotteryTarget: boolean;
  /** 応募受付期間(= 企画表示期間を流用)。null は無制限。 */
  collectionDisplayStartsAt: string | null;
  collectionDisplayEndsAt: string | null;
}

/**
 * 公開台紙ページ用に token(= collection_completions.id) から完了済み台紙を解決する。
 * 完了(completed)していない・存在しない・URL を組み立てられない場合は null。
 */
export async function getPublicMountByToken(
  token: string,
): Promise<PublicMount | null> {
  if (!UUID_PATTERN.test(token)) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("collection_completions")
    .select(
      "id, user_id, category_key, mount_image_path, completed_at, preset_categories(display_name_ja, display_name_en, mount_template_width, mount_template_height, lottery_target, collection_display_starts_at, collection_display_ends_at)",
    )
    .eq("id", token)
    .eq("mount_status", "completed")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const mountImageUrl = buildPublicGeneratedImageUrl(
    (data.mount_image_path as string | null) ?? null,
  );
  if (!mountImageUrl) {
    return null;
  }

  const category = (data as { preset_categories?: unknown }).preset_categories;
  const cat = Array.isArray(category) ? category[0] : category;
  const catRecord = (cat ?? {}) as {
    display_name_ja?: string;
    display_name_en?: string;
    mount_template_width?: number | null;
    mount_template_height?: number | null;
    lottery_target?: boolean | null;
    collection_display_starts_at?: string | null;
    collection_display_ends_at?: string | null;
  };

  return {
    completionId: data.id as string,
    ownerId: data.user_id as string,
    categoryKey: data.category_key as string,
    displayNameJa: catRecord.display_name_ja ?? "",
    displayNameEn: catRecord.display_name_en ?? "",
    mountImageUrl,
    completedAt: (data.completed_at as string | null) ?? null,
    mountTemplateWidth: catRecord.mount_template_width ?? null,
    mountTemplateHeight: catRecord.mount_template_height ?? null,
    lotteryTarget: catRecord.lottery_target ?? false,
    collectionDisplayStartsAt: catRecord.collection_display_starts_at ?? null,
    collectionDisplayEndsAt: catRecord.collection_display_ends_at ?? null,
  };
}

export interface PublicCollectionBook {
  completionId: string;
  ownerId: string;
  categoryKey: string;
  displayNameJa: string;
  /** 0ページ目の表紙画像URL(book_cover_path)。未登録なら null(簡易表紙にフォールバック)。 */
  coverImageUrl: string | null;
  /** 各ページ画像URL(順序付き)。 */
  pageImageUrls: string[];
  /** OGP/シェア用の1枚絵URL(= mount_image_path のテーマ表紙)。 */
  ogpImageUrl: string | null;
  completedAt: string | null;
}

/**
 * 公開「めくれる日記帳(book)」用に token(= collection_completions.id)から完了済みの本を解決する。
 * 完了していない / book_page_paths が無い / 存在しない場合は null。
 */
export const getCollectionBookByToken = cache(async (
  token: string,
): Promise<PublicCollectionBook | null> => {
  if (!UUID_PATTERN.test(token)) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("collection_completions")
    .select(
      "id, user_id, category_key, mount_image_path, completed_at, book_page_paths, preset_categories(display_name_ja, book_cover_path)",
    )
    .eq("id", token)
    .eq("mount_status", "completed")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const rawPaths = (data as { book_page_paths?: unknown }).book_page_paths;
  const pagePaths = Array.isArray(rawPaths)
    ? rawPaths.filter((p): p is string => typeof p === "string")
    : [];
  if (pagePaths.length === 0) {
    return null;
  }

  const pageImageUrls = pagePaths
    .map((p) => buildPublicGeneratedImageUrl(p))
    .filter((u): u is string => Boolean(u));
  if (pageImageUrls.length === 0) {
    return null;
  }

  const category = (data as { preset_categories?: unknown }).preset_categories;
  const cat = Array.isArray(category) ? category[0] : category;
  const catRecord = (cat ?? {}) as {
    display_name_ja?: string;
    book_cover_path?: string | null;
  };

  // OGP(Xシェア画像)は横長バナー。book は mount_image_path(=はじまり/縦長)とは別に、
  // ツイン ogp-{ts}.png にバナーを保存しているのでそちらを参照する(mount モードと同方式)。
  const mountPath = (data.mount_image_path as string | null) ?? null;
  const bookOgpPath =
    mountPath && mountPath.includes("/mount-")
      ? mountPath.replace("/mount-", "/ogp-")
      : mountPath;

  return {
    completionId: data.id as string,
    ownerId: data.user_id as string,
    categoryKey: data.category_key as string,
    displayNameJa: catRecord.display_name_ja ?? "",
    coverImageUrl: buildPublicGeneratedImageUrl(catRecord.book_cover_path ?? null),
    pageImageUrls,
    ogpImageUrl: withOgpVersion(buildPublicGeneratedImageUrl(bookOgpPath)),
    completedAt: (data.completed_at as string | null) ?? null,
  };
});

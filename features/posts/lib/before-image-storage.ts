/**
 * Before（生成元）画像の永続化機能（サーバーサイド専用）
 *
 * 生成完了時（image-gen-worker → /api/internal/generated-images/persist-before-image）に
 * 呼び出され、image_jobs.input_image_url の画像を WebP に変換して
 * `{user_id}/pre-generation/{generated_image_id}_display.webp` に保存する。
 *
 * 入力 URL は generated-images バケット配下の公開 URL（temp/ アップロード由来 or
 * {user_id}/stocks/ ストック由来）のみを受理する。それ以外は SSRF 防止のため拒否。
 *
 * 失敗してもログのみで投稿などの上流フローは止めない設計。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateDisplayWebP } from "@/features/generation/lib/webp-converter";

const STORAGE_BUCKET = "generated-images";

/**
 * 入力 URL を受理するか判定する。
 * `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-images/...` のみ通す。
 * 同バケット内なら temp/ もストック画像も受理する。
 */
export function isAllowedInputImageUrl(rawUrl: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return false;
  }
  const expectedPrefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  return rawUrl.startsWith(expectedPrefix);
}

/**
 * 公開 URL から「`generated-images` バケット内の object path」を取り出す。
 * 想定外の URL なら null。
 */
export function extractStoragePathFromPublicUrl(rawUrl: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return null;
  }
  const expectedPrefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!rawUrl.startsWith(expectedPrefix)) {
    return null;
  }
  return decodeURIComponent(rawUrl.slice(expectedPrefix.length));
}

/**
 * generated_images.image_job_id 経由で image_jobs.input_image_url と user_id を取得する。
 * 2-step lookup（Supabase JS の embed 型が many-to-one でも配列推論されるため）。
 */
export async function getInputImageContextForGeneratedImage(
  generatedImageId: string
): Promise<{ userId: string; inputImageUrl: string | null } | null> {
  const supabase = createAdminClient();

  const { data: gen, error: genError } = await supabase
    .from("generated_images")
    .select("user_id, image_job_id")
    .eq("id", generatedImageId)
    .maybeSingle();

  if (genError) {
    console.error("[BeforeImage] failed to fetch generated_images:", genError);
    return null;
  }
  if (!gen?.user_id) {
    return null;
  }
  if (!gen.image_job_id) {
    return { userId: gen.user_id, inputImageUrl: null };
  }

  const { data: job, error: jobError } = await supabase
    .from("image_jobs")
    .select("input_image_url")
    .eq("id", gen.image_job_id)
    .maybeSingle();

  if (jobError) {
    console.error("[BeforeImage] failed to fetch image_jobs.input_image_url:", jobError);
    return { userId: gen.user_id, inputImageUrl: null };
  }
  return { userId: gen.user_id, inputImageUrl: job?.input_image_url ?? null };
}

/**
 * 入力 URL から WebP（長辺 1280px / q=85）を生成し、
 * `{userId}/pre-generation/{generatedImageId}_display.webp` に upsert アップロードする。
 */
export async function persistBeforeImageFromUrl(
  inputImageUrl: string,
  userId: string,
  generatedImageId: string,
  maxRetries: number = 3
): Promise<string> {
  if (!isAllowedInputImageUrl(inputImageUrl)) {
    throw new Error("Before persistence rejected: input URL is not under generated-images bucket");
  }

  const supabase = createAdminClient();
  const targetPath = `${userId}/pre-generation/${generatedImageId}_display.webp`;

  let attempt = 0;
  for (;;) {
    try {
      const webpBuffer = await generateDisplayWebP(inputImageUrl);
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(targetPath, webpBuffer, {
          contentType: "image/webp",
          upsert: true,
        });

      if (error) {
        throw new Error(`Before WebP upload failed: ${error.message}`);
      }
      return data.path;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(
          `[BeforeImage] persistBeforeImageFromUrl failed after ${maxRetries} attempts:`,
          err
        );
        throw err;
      }
      console.warn(
        `[BeforeImage] persistBeforeImageFromUrl retry ${attempt}/${maxRetries}:`,
        err
      );
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

/**
 * generated_images.pre_generation_storage_path を更新する。
 */
export async function updatePreGenerationStoragePath(
  generatedImageId: string,
  userId: string,
  path: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("generated_images")
    .update({ pre_generation_storage_path: path })
    .eq("id", generatedImageId)
    .eq("user_id", userId);

  if (error) {
    console.error("[BeforeImage] failed to update pre_generation_storage_path:", error);
    throw new Error(`pre_generation_storage_path update failed: ${error.message}`);
  }
}

/**
 * temp/ 配下のオブジェクトを削除する。失敗してもログのみで例外を投げない。
 * Before 永続化に成功したジョブで、対応する temp/ ファイルを片付けるために使う。
 */
export async function deleteTempInputImageIfExists(inputImageUrl: string): Promise<void> {
  const path = extractStoragePathFromPublicUrl(inputImageUrl);
  if (!path) {
    return;
  }
  if (!path.startsWith("temp/")) {
    // ストック画像由来などは削除対象外
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) {
    console.warn("[BeforeImage] failed to delete temp input image (will be cleaned by cron):", {
      path,
      error: error.message,
    });
  }
}

/**
 * 生成完了時の Before 永続化フロー全体。失敗してもログのみで例外は投げない。
 *
 * 1. image_jobs.input_image_url を引く
 * 2. URL バリデーション（generated-images バケット配下のみ）
 * 3. WebP 化 → pre-generation/ に upsert
 * 4. generated_images.pre_generation_storage_path を更新
 * 5. URL が temp/ 配下なら同期削除（β: cron は orphan 安全網）
 *
 * 既に pre_generation_storage_path がある場合（再実行）は再変換せずスキップ。
 */
export async function persistBeforeImageForGeneratedImage(
  generatedImageId: string
): Promise<{ status: "persisted" | "skipped" | "failed"; path?: string; reason?: string }> {
  try {
    const supabase = createAdminClient();

    const { data: existing, error: existingError } = await supabase
      .from("generated_images")
      .select("user_id, pre_generation_storage_path")
      .eq("id", generatedImageId)
      .maybeSingle();

    if (existingError) {
      console.error("[BeforeImage] failed to check existing path:", existingError);
      return { status: "failed", reason: "lookup-failed" };
    }
    if (!existing) {
      return { status: "skipped", reason: "generated-image-not-found" };
    }
    if (existing.pre_generation_storage_path) {
      return {
        status: "skipped",
        path: existing.pre_generation_storage_path,
        reason: "already-persisted",
      };
    }

    const ctx = await getInputImageContextForGeneratedImage(generatedImageId);
    if (!ctx?.inputImageUrl) {
      return { status: "skipped", reason: "no-input-image-url" };
    }
    if (!isAllowedInputImageUrl(ctx.inputImageUrl)) {
      console.warn(
        "[BeforeImage] input_image_url is outside generated-images bucket, skipping:",
        ctx.inputImageUrl
      );
      return { status: "skipped", reason: "invalid-input-url" };
    }

    const persistedPath = await persistBeforeImageFromUrl(
      ctx.inputImageUrl,
      ctx.userId,
      generatedImageId
    );
    await updatePreGenerationStoragePath(generatedImageId, ctx.userId, persistedPath);

    // 永続化成功時は temp/ ファイルを同期削除（ストック由来は no-op）
    await deleteTempInputImageIfExists(ctx.inputImageUrl);

    return { status: "persisted", path: persistedPath };
  } catch (err) {
    console.error("[BeforeImage] persistBeforeImageForGeneratedImage unexpected error:", err);
    return { status: "failed", reason: err instanceof Error ? err.message : "unknown-error" };
  }
}

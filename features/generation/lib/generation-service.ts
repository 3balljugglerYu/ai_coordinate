import { generateImage } from "./api";
import { uploadImageToStorage } from "./storage";
import { saveGeneratedImages } from "./database";
import { consumeCredits, fetchCreditBalance } from "@/features/credits/lib/api";
import { GENERATION_CREDIT_COST } from "@/features/credits/credit-packages";
import type { GenerationRequest, GeneratedImageData } from "../types";
import type { GeneratedImageRecord } from "./database";

/**
 * 画像生成と保存を統合したサービス
 */

export interface GenerateAndSaveOptions extends GenerationRequest {
  userId: string | null;
}

export interface GenerateAndSaveResult {
  images: GeneratedImageData[];
  records: GeneratedImageRecord[];
}

/**
 * Supabaseが設定されているかチェック
 */
function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * 画像を生成してSupabase Storageとデータベースに保存
 */
export async function generateAndSaveImages(
  options: GenerateAndSaveOptions
): Promise<GenerateAndSaveResult> {
  const { userId, ...generationRequest } = options;
  const imageCount = generationRequest.count || 1;

  const shouldConsumeCredits =
    !!userId && isSupabaseConfigured() && imageCount > 0;

  if (shouldConsumeCredits) {
    const requiredCredits = imageCount * GENERATION_CREDIT_COST;

    try {
      const { balance } = await fetchCreditBalance();
      if (balance < requiredCredits) {
        throw new Error(
          `クレジット残高が不足しています。生成には${requiredCredits}クレジット必要ですが、現在の残高は${balance}クレジットです。`
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("クレジット残高の確認に失敗しました");
    }
  }

  // 1. 画像を生成
  const generatedImages = await generateImage(generationRequest);

  // 開発モード: Supabaseが設定されていない場合はローカルデータのみ返す
  if (!isSupabaseConfigured()) {
    console.warn(
      "⚠️ Supabase is not configured. Running in development mode (images not saved)."
    );
    return {
      images: generatedImages,
      records: [],
    };
  }

  // 2. Supabase Storageにアップロード
  const uploadPromises = generatedImages.map(async (image) => {
    if (!image.data) {
      throw new Error("画像データがありません");
    }

    const mimeType = image.url.match(/data:(.+);base64/)?.[1] || "image/png";
    const { path, url } = await uploadImageToStorage(
      image.data,
      mimeType,
      userId
    );

    return {
      storage_path: path,
      public_url: url,
      local_id: image.id,
    };
  });

  const uploadResults = await Promise.all(uploadPromises);

  // 3. データベースにメタデータを保存
  const imageRecords = uploadResults.map((result) => ({
    user_id: userId,
    image_url: result.public_url,
    storage_path: result.storage_path,
    prompt: generationRequest.prompt,
    background_change: generationRequest.backgroundChange || false,
    is_posted: false,
    caption: null,
    posted_at: null,
    generation_type: "coordinate" as const,
    source_image_stock_id: generationRequest.sourceImageStockId || null,
    input_images: generationRequest.sourceImageStockId
      ? { stock_id: generationRequest.sourceImageStockId }
      : generationRequest.sourceImage
      ? { uploaded: true }
      : null,
  }));

  const savedRecords = await saveGeneratedImages(imageRecords);

  // 4. クレジットを消費
  if (shouldConsumeCredits) {
    for (const record of savedRecords) {
      if (!record.id) continue;
      await consumeCredits({
        generationId: record.id,
        credits: GENERATION_CREDIT_COST,
      });
    }
  }

  // 5. 生成画像データに公開URLを設定
  const imagesWithPublicUrls = generatedImages.map((image, index) => ({
    ...image,
    url: uploadResults[index].public_url,
    id: savedRecords[index].id || image.id,
  }));

  return {
    images: imagesWithPublicUrls,
    records: savedRecords,
  };
}

/**
 * 認証チェック: ユーザーIDを取得
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { getCurrentUser } = await import("@/features/auth/lib/auth-client");
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * 認証済みユーザーかチェック
 */
export async function isAuthenticated(): Promise<boolean> {
  const userId = await getCurrentUserId();
  return userId !== null;
}

/**
 * 認証が必要な操作の前にチェック
 */
export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("ログインが必要です");
  }
  return userId;
}


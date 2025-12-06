import { generateSingleImage } from "./api";
import { uploadImageToStorage } from "./storage";
import { saveGeneratedImage } from "./database";
import { consumeCredits, fetchCreditBalance } from "@/features/credits/lib/api";
import { GENERATION_CREDIT_COST } from "@/features/credits/credit-packages";
import type { GenerationRequest, GeneratedImageData } from "../types";
import type { GeneratedImageRecord } from "./database";

/**
 * 画像生成と保存を統合したサービス
 */

export interface GenerateAndSaveOptions extends GenerationRequest {
  userId: string | null;
  /**
   * 各画像の保存完了ごとに呼ばれる進捗コールバック
   */
  onProgress?: (payload: {
    image: GeneratedImageData;
    record?: GeneratedImageRecord;
    index: number;
    total: number;
  }) => void;
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
  const { userId, onProgress, ...generationRequest } = options;
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

  const allImages: GeneratedImageData[] = [];
  const allRecords: GeneratedImageRecord[] = [];

  // Supabase が未設定の場合: 画像生成のみを行い、その都度コールバックを呼ぶ
  if (!isSupabaseConfigured()) {
    console.warn(
      "⚠️ Supabase is not configured. Running in development mode (images not saved)."
    );

    for (let index = 0; index < imageCount; index++) {
      const image = await generateSingleImage({
        prompt: generationRequest.prompt,
        sourceImage: generationRequest.sourceImage,
        sourceImageStockId: generationRequest.sourceImageStockId,
        backgroundChange: generationRequest.backgroundChange,
        generationType: generationRequest.generationType,
      });

      allImages.push(image);

      onProgress?.({
        image,
        record: undefined,
        index,
        total: imageCount,
      });
    }

    return {
      images: allImages,
      records: [],
    };
  }

  // Supabase 設定あり: 1枚ずつ生成 → アップロード → DB保存 → クレジット消費 → コールバック
  for (let index = 0; index < imageCount; index++) {
    const generated = await generateSingleImage({
      prompt: generationRequest.prompt,
      sourceImage: generationRequest.sourceImage,
      sourceImageStockId: generationRequest.sourceImageStockId,
      backgroundChange: generationRequest.backgroundChange,
      generationType: generationRequest.generationType,
    });

    if (!generated.data) {
      throw new Error("画像データがありません");
    }

    const mimeType =
      generated.url.match(/data:(.+);base64/)?.[1] || "image/png";
    const { path, url } = await uploadImageToStorage(
      generated.data,
      mimeType,
      userId
    );

    const recordToSave: Omit<GeneratedImageRecord, "id" | "created_at"> = {
      user_id: userId,
      image_url: url,
      storage_path: path,
      prompt: generationRequest.prompt,
      background_change: generationRequest.backgroundChange || false,
      is_posted: false,
      caption: null,
      posted_at: null,
      generation_type: (generationRequest.generationType ||
        "coordinate") as "coordinate" | "specified_coordinate" | "full_body" | "chibi",
      source_image_stock_id: generationRequest.sourceImageStockId || null,
      input_images: generationRequest.sourceImageStockId
        ? { stock_id: generationRequest.sourceImageStockId }
        : generationRequest.sourceImage
        ? { uploaded: true }
        : null,
    };

    const savedRecord = await saveGeneratedImage(recordToSave);
    allRecords.push(savedRecord);

    if (shouldConsumeCredits && savedRecord.id) {
      await consumeCredits({
        generationId: savedRecord.id,
        credits: GENERATION_CREDIT_COST,
      });
    }

    const imageForClient: GeneratedImageData = {
      ...generated,
      url,
      id: savedRecord.id || generated.id,
    };

    allImages.push(imageForClient);

    onProgress?.({
      image: imageForClient,
      record: savedRecord,
      index,
      total: imageCount,
    });
  }

  return {
    images: allImages,
    records: allRecords,
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


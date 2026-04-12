import { z } from "zod";
import {
  normalizeModelName,
  backgroundModeToBackgroundChange,
  resolveBackgroundMode,
  BACKGROUND_MODES,
  SOURCE_IMAGE_TYPES,
} from "../types";
import { GENERATION_PROMPT_MAX_LENGTH } from "./prompt-validation";

/**
 * 画像生成機能のZodスキーマ
 * APIの入力バリデーションに使用
 */

// 許可された画像MIMEタイプ
// 注意: HEIC/HEIFは変換処理を通るため、JPEG/PNGに変換される
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

/**
 * MIMEタイプから安全に拡張子を取得
 * パストラバーサル攻撃を防ぐため、許可されたMIMEタイプのみを処理
 */
function getSafeExtensionFromMimeType(mimeType: string): string {
  // MIMEタイプを正規化（小文字、余分な空白を削除）
  const normalized = mimeType.toLowerCase().trim();
  
  // 許可されたMIMEタイプから拡張子をマッピング
  const mimeToExtension: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  
  return mimeToExtension[normalized] || 'png'; // デフォルトはpng
}

export const generationRequestSchema = z.object({
  prompt: z
    .string()
    .min(1, "着せ替え内容を入力してください")
    .max(
      GENERATION_PROMPT_MAX_LENGTH,
      `着せ替え内容は${GENERATION_PROMPT_MAX_LENGTH}文字以内で入力してください`
    ),
  sourceImageBase64: z.string().optional(),
  sourceImageMimeType: z
    .string()
    .optional()
    .refine(
      (val) => !val || ALLOWED_IMAGE_MIME_TYPES.includes(val.toLowerCase().trim() as typeof ALLOWED_IMAGE_MIME_TYPES[number]),
      {
        message: "許可されていない画像形式です。PNG、JPEG、WebP、GIF、HEIC（HEIF）のみ対応しています。",
      }
    ),
  sourceImageStockId: z.string().uuid().optional(),
  sourceImageType: z.enum(SOURCE_IMAGE_TYPES).optional().default("illustration"),
  backgroundMode: z.enum(BACKGROUND_MODES).optional(),
  backgroundChange: z.boolean().optional(),
  count: z.number().int().min(1).max(4).optional().default(1),
  generationType: z
    .enum([
      'coordinate',
      'specified_coordinate',
      'full_body',
      'chibi',
      'one_tap_style',
    ])
    .optional()
    .default('coordinate'),
  model: z
    .enum([
      'gemini-3.1-flash-image-preview-512',
      'gemini-3.1-flash-image-preview-1024',
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-3-pro-image-1k',
      'gemini-3-pro-image-2k',
      'gemini-3-pro-image-4k',
      // 後方互換性のため、preview版も受け入れる
      'gemini-2.5-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-3-pro-image',
    ])
    .optional()
    .default('gemini-3.1-flash-image-preview-512')
    .transform(normalizeModelName), // データベース保存用に正規化
}).superRefine((data, ctx) => {
  const hasSourceImageStockId =
    typeof data.sourceImageStockId === "string" &&
    data.sourceImageStockId.length > 0;
  const hasSourceImageBase64 =
    typeof data.sourceImageBase64 === "string" &&
    data.sourceImageBase64.trim().length > 0;
  const hasSourceImageMimeType =
    typeof data.sourceImageMimeType === "string" &&
    data.sourceImageMimeType.trim().length > 0;

  // フロント仕様と合わせて、元画像（アップロード or ストック）を必須化
  if (!hasSourceImageStockId && !(hasSourceImageBase64 && hasSourceImageMimeType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceImageBase64"],
      message: "人物画像をアップロードまたはストック画像を選択してください",
    });
  }
}).transform((data) => {
  const backgroundMode = resolveBackgroundMode(
    data.backgroundMode,
    data.backgroundChange
  );

  return {
    ...data,
    backgroundMode,
    // サーバー内の後方互換用にboolean値も正規化して保持
    backgroundChange: backgroundModeToBackgroundChange(backgroundMode),
  };
});

export type GenerationRequestInput = z.infer<typeof generationRequestSchema>;

// getSafeExtensionFromMimeTypeをエクスポート（route.tsで使用）
export { getSafeExtensionFromMimeType };

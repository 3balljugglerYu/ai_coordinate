import { z } from "zod";
import { normalizeModelName } from "../types";

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
    .max(1000, "プロンプトが長すぎます"),
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
  backgroundChange: z.boolean().optional().default(false),
  count: z.number().int().min(1).max(4).optional().default(1),
  generationType: z
    .enum(['coordinate', 'specified_coordinate', 'full_body', 'chibi'])
    .optional()
    .default('coordinate'),
  model: z
    .enum([
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
    .default('gemini-2.5-flash-image')
    .transform(normalizeModelName), // データベース保存用に正規化
});

export type GenerationRequestInput = z.infer<typeof generationRequestSchema>;

// getSafeExtensionFromMimeTypeをエクスポート（route.tsで使用）
export { getSafeExtensionFromMimeType };

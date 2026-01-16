import { z } from "zod";
import { normalizeModelName } from "../types";

/**
 * 画像生成機能のZodスキーマ
 * APIの入力バリデーションに使用
 */

export const generationRequestSchema = z.object({
  prompt: z
    .string()
    .min(1, "着せ替え内容を入力してください")
    .max(1000, "プロンプトが長すぎます"),
  sourceImageBase64: z.string().optional(),
  sourceImageMimeType: z.string().optional(),
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


import { z } from "zod";

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
  backgroundChange: z.boolean().optional().default(false),
  count: z.number().int().min(1).max(4).optional().default(1),
  generationType: z
    .enum(['coordinate', 'specified_coordinate', 'full_body', 'chibi'])
    .optional()
    .default('coordinate'),
});

export type GenerationRequestInput = z.infer<typeof generationRequestSchema>;


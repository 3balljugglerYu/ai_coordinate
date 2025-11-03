import { z } from "zod";

/**
 * 画像生成機能のZodスキーマ
 * APIの入力バリデーションに使用
 */

export const generationRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(1000, "Prompt is too long"),
  style: z.string().optional(),
  size: z.enum(["small", "medium", "large"]).optional().default("medium"),
});

export type GenerationRequestInput = z.infer<typeof generationRequestSchema>;


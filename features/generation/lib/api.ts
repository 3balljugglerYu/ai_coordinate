import { generationRequestSchema } from "./schema";
import type { GenerationResponse } from "../types";

/**
 * 画像生成APIクライアント（クライアントサイド用）
 */

export async function generateImage(
  request: { prompt: string; style?: string; size?: string }
): Promise<GenerationResponse> {
  const validatedData = generationRequestSchema.parse(request);

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validatedData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate image");
  }

  return response.json();
}

export async function getGenerationStatus(
  generationId: string
): Promise<GenerationResponse> {
  const response = await fetch(`/api/generation-status?id=${generationId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get generation status");
  }

  return response.json();
}


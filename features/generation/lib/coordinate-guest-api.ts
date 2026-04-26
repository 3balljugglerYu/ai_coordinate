/**
 * /api/coordinate-generate-guest を叩くクライアント側ヘルパ。
 *
 * 認証ユーザーは別経路 (`async-api.ts` の `generateImageAsync`) を使う。
 * この helper はゲスト sync 専用で、結果は data URL でそのまま返ってくる (UCL-003)。
 *
 * 関連: features/generation/lib/guest-generate.ts (server)、
 *       app/api/coordinate-generate-guest/handler.ts (route)
 */

import type { GeminiModel } from "@/features/generation/types";
import { normalizeSourceImage } from "./normalize-source-image";
import type { BackgroundMode, SourceImageType } from "@/shared/generation/prompt-core";
import type { GenerationType } from "@/features/generation/types";

export interface CoordinateGuestGenerateRequest {
  prompt: string;
  sourceImage: File;
  sourceImageType?: SourceImageType;
  backgroundMode?: BackgroundMode;
  generationType?: GenerationType;
  model: GeminiModel;
}

export interface CoordinateGuestGenerateSuccess {
  kind: "success";
  imageDataUrl: string;
  mimeType: string;
}

export interface CoordinateGuestGenerateFailure {
  kind: "failure";
  status: number;
  errorCode: string | null;
  message: string;
  signupCta: boolean;
  signupPath: string | null;
}

export type CoordinateGuestGenerateResult =
  | CoordinateGuestGenerateSuccess
  | CoordinateGuestGenerateFailure;

interface ResponseBody {
  imageDataUrl?: string;
  mimeType?: string;
  error?: string;
  errorCode?: string;
  signupCta?: boolean;
  signupPath?: string;
}

/**
 * ゲスト sync ルートを叩いて、結果を data URL で受け取る。
 * 例外は投げず、status と errorCode を含む `CoordinateGuestGenerateFailure` を返す。
 */
export async function submitGuestCoordinateGeneration(
  request: CoordinateGuestGenerateRequest
): Promise<CoordinateGuestGenerateResult> {
  const normalizedFile = await normalizeSourceImage(request.sourceImage);

  const formData = new FormData();
  formData.set("prompt", request.prompt);
  formData.set("uploadImage", normalizedFile);
  formData.set("sourceImageType", request.sourceImageType ?? "illustration");
  formData.set("backgroundMode", request.backgroundMode ?? "keep");
  formData.set("generationType", request.generationType ?? "coordinate");
  formData.set("model", request.model);

  const response = await fetch("/api/coordinate-generate-guest", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as ResponseBody | null;

  if (response.ok && body?.imageDataUrl && body.mimeType) {
    return {
      kind: "success",
      imageDataUrl: body.imageDataUrl,
      mimeType: body.mimeType,
    };
  }

  return {
    kind: "failure",
    status: response.status,
    errorCode: body?.errorCode ?? null,
    message: body?.error ?? "Generation failed",
    signupCta: Boolean(body?.signupCta),
    signupPath: typeof body?.signupPath === "string" ? body.signupPath : null,
  };
}

import type { GeminiApiModel } from "@/features/generation/types";

type GeminiContentPart = {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
};

export interface GeminiGenerateContentRequestBody {
  contents: Array<{
    parts: GeminiContentPart[];
  }>;
  generationConfig?: {
    candidateCount?: number;
    responseModalities?: Array<"TEXT" | "IMAGE">;
    imageConfig?: {
      imageSize?: "512" | "1K" | "2K" | "4K";
      /**
       * 出力アスペクト比 (Gemini 全モデル共通の 9 段階)。
       * `shared/generation/gemini-aspect-ratio.ts` の `GeminiAspectRatio` 型と一致。
       * 9:16 〜 16:9 のクランプは `resolveGeminiAspectRatio()` で行う。
       */
      aspectRatio?:
        | "9:16"
        | "4:5"
        | "3:4"
        | "2:3"
        | "1:1"
        | "3:2"
        | "4:3"
        | "5:4"
        | "16:9";
    };
  };
}

export interface GenerateContentParams {
  apiKey: string;
  model: GeminiApiModel;
  body: GeminiGenerateContentRequestBody;
}

export interface NanobananaClient {
  generateContent(params: GenerateContentParams): Promise<Response>;
}

function buildApiUrl(model: GeminiApiModel): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export class HttpNanobananaClient implements NanobananaClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async generateContent(params: GenerateContentParams): Promise<Response> {
    return this.fetchImpl(buildApiUrl(params.model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify(params.body),
    });
  }
}

export function createNanobananaClient(
  fetchImpl: typeof fetch = fetch
): NanobananaClient {
  return new HttpNanobananaClient(fetchImpl);
}

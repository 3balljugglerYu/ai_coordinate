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
    imageConfig?: {
      imageSize?: "1K" | "2K" | "4K";
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

/**
 * NanoBanana (Gemini 2.5 Flash Image) API クライアント
 */

/**
 * 画像をBase64形式に変換
 */
export async function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Gemini API用のリクエスト型
 */
export interface GeminiGenerateRequest {
  prompt: string;
  sourceImage?: File;
  backgroundChange?: boolean;
  count?: number;
}

/**
 * Gemini API用のコンテンツパート
 */
interface GeminiContentPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

/**
 * Gemini APIリクエストボディを構築
 */
export async function buildGeminiRequest(
  request: GeminiGenerateRequest
): Promise<{
  contents: Array<{
    parts: GeminiContentPart[];
  }>;
  generationConfig?: {
    candidateCount?: number;
  };
}> {
  const parts: GeminiContentPart[] = [];

  // 元画像がある場合は追加
  if (request.sourceImage) {
    const base64Image = await imageToBase64(request.sourceImage);
    parts.push({
      inline_data: {
        mime_type: request.sourceImage.type,
        data: base64Image,
      },
    });
  }

  // プロンプトを構築
  let fullPrompt = request.prompt;
  
  if (request.sourceImage) {
    // 画像がある場合は着せ替え用のプロンプトを追加
    fullPrompt = `この画像の人物の顔やスタイルはそのままに、${request.prompt}。`;
    
    if (request.backgroundChange) {
      fullPrompt += "背景も新しいスタイルに合わせて変更してください。";
    } else {
      fullPrompt += "背景はできるだけそのままにしてください。";
    }
  }

  parts.push({
    text: fullPrompt,
  });

  const requestBody: {
    contents: Array<{
      parts: GeminiContentPart[];
    }>;
    generationConfig?: {
      candidateCount?: number;
    };
  } = {
    contents: [
      {
        parts,
      },
    ],
  };

  // 生成枚数を指定（1-4枚）
  if (request.count && request.count > 1) {
    requestBody.generationConfig = {
      candidateCount: Math.min(request.count, 4),
    };
  }

  return requestBody;
}

/**
 * Gemini APIレスポンス型
 */
export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        // スネークケース形式（APIドキュメント）
        inline_data?: {
          mime_type: string;
          data: string;
        };
        // キャメルケース形式（実際のレスポンス）
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Gemini APIレスポンスから画像データを抽出
 */
export function extractImagesFromGeminiResponse(
  response: GeminiResponse
): Array<{ mimeType: string; data: string }> {
  const images: Array<{ mimeType: string; data: string }> = [];

  if (!response.candidates) {
    return images;
  }

  for (const candidate of response.candidates) {
    for (const part of candidate.content.parts) {
      // キャメルケース形式（実際のレスポンス）
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      }
      // スネークケース形式（念のため両方サポート）
      else if (part.inline_data) {
        images.push({
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        });
      }
    }
  }

  return images;
}

/**
 * Base64画像をBlobに変換
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Base64画像をData URLに変換
 */
export function base64ToDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}


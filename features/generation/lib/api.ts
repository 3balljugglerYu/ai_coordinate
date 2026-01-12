import { imageToBase64, extractImagesFromGeminiResponse, base64ToDataUrl } from "./nanobanana";
import type { GenerationRequest, GeneratedImageData } from "../types";
import type { GeminiResponse } from "./nanobanana";

/**
 * 画像生成APIクライアント（クライアントサイド用）
 */

/**
 * URLから画像を取得してBase64に変換
 */
async function urlToBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.statusText}`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/png";
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // data:image/png;base64, のプレフィックスを除去
      const base64 = result.split(",")[1] || result;
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 単一画像を生成
 */
export async function generateSingleImage(
  request: Omit<GenerationRequest, "count">
): Promise<GeneratedImageData> {
  // 画像をBase64に変換
  let sourceImageBase64: string | undefined;
  let sourceImageMimeType: string | undefined;

  if (request.sourceImage) {
    sourceImageBase64 = await imageToBase64(request.sourceImage);
    sourceImageMimeType = request.sourceImage.type;
  } else if (request.sourceImageStockId) {
    // ストック画像IDから画像URLを取得してBase64に変換
    const { getSourceImageStock } = await import("./database");
    const stock = await getSourceImageStock(request.sourceImageStockId);
    if (!stock) {
      throw new Error("ストック画像が見つかりません");
    }
    const { base64, mimeType } = await urlToBase64(stock.image_url);
    sourceImageBase64 = base64;
    sourceImageMimeType = mimeType;
  }

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: request.prompt,
      sourceImageBase64,
      sourceImageMimeType,
      backgroundChange: request.backgroundChange || false,
      count: 1, // 常に1枚
      generationType: request.generationType || 'coordinate',
      model: request.model || 'gemini-2.5-flash-image',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "画像の生成に失敗しました");
  }

  const data: GeminiResponse = await response.json();

  // レスポンスから画像データを抽出
  const images = extractImagesFromGeminiResponse(data);

  if (images.length === 0) {
    console.error("No images extracted. Response structure:", data);
    throw new Error("画像が生成されませんでした。APIレスポンスを確認してください。");
  }

  const image = images[0];
  return {
    id: `${Date.now()}-${Math.random()}`,
    url: base64ToDataUrl(image.data, image.mimeType),
    data: image.data,
    is_posted: false,
  };
}

/**
 * 複数枚の画像を順次生成
 */
export async function generateImage(
  request: GenerationRequest
): Promise<GeneratedImageData[]> {
  const count = request.count || 1;
  const results: GeneratedImageData[] = [];

  console.log(`Generating ${count} image(s)...`);

  // 1枚ずつ順次生成
  for (let i = 0; i < count; i++) {
    console.log(`Generating image ${i + 1}/${count}...`);
    
    const image = await generateSingleImage({
      prompt: request.prompt,
      sourceImage: request.sourceImage,
      sourceImageStockId: request.sourceImageStockId,
      backgroundChange: request.backgroundChange,
      generationType: request.generationType,
      model: request.model,
    });

    results.push(image);
    console.log(`✓ Image ${i + 1}/${count} generated`);
  }

  console.log(`All ${count} images generated successfully`);
  return results;
}

/**
 * 生成された画像をダウンロード
 */
export function downloadImage(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


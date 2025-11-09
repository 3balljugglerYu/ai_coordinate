import { imageToBase64, extractImagesFromGeminiResponse, base64ToDataUrl } from "./nanobanana";
import type { GenerationRequest, GeneratedImageData } from "../types";
import type { GeminiResponse } from "./nanobanana";

/**
 * 画像生成APIクライアント（クライアントサイド用）
 */

/**
 * 単一画像を生成
 */
async function generateSingleImage(
  request: Omit<GenerationRequest, "count">
): Promise<GeneratedImageData> {
  // 画像をBase64に変換
  let sourceImageBase64: string | undefined;
  let sourceImageMimeType: string | undefined;

  if (request.sourceImage) {
    sourceImageBase64 = await imageToBase64(request.sourceImage);
    sourceImageMimeType = request.sourceImage.type;
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
      backgroundChange: request.backgroundChange,
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


"use client";

import { useState } from "react";
import { GenerationForm } from "./GenerationForm";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import {
  generateAndSaveImages,
  getCurrentUserId,
} from "../lib/generation-service";
import type { GeneratedImageData } from "../types";

export function CoordinatePageContent() {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    backgroundChange: boolean;
    count: number;
  }) => {
    setIsGenerating(true);
    setError(null);
    setGeneratingCount(data.count);
    setCompletedCount(0);
    setGeneratedImages([]);

    try {
      const userId = await getCurrentUserId();

      const result = await generateAndSaveImages({
        prompt: data.prompt,
        sourceImage: data.sourceImage,
        sourceImageStockId: data.sourceImageStockId,
        backgroundChange: data.backgroundChange,
        count: data.count,
        userId,
      });

      setGeneratedImages(result.images);
      setCompletedCount(result.images.length);

      if (result.records.length === 0) {
        console.info(
          "✅ 画像生成成功！（開発モード: Supabase未設定のため保存はスキップされました）"
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の生成に失敗しました");
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 生成フォーム */}
      <GenerationForm onSubmit={handleGenerate} isGenerating={isGenerating} />

      {/* エラー表示 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {/* 生成結果プレビュー */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          生成結果プレビュー
        </h2>
        <GeneratedImageGallery
          images={generatedImages}
          isGenerating={isGenerating}
          generatingCount={generatingCount}
          completedCount={completedCount}
        />
      </div>
    </div>
  );
}


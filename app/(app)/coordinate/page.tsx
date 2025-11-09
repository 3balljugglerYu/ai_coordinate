"use client";

import { useState } from "react";
import { GenerationForm } from "@/features/generation/components/GenerationForm";
import { GeneratedImageGallery } from "@/features/generation/components/GeneratedImageGallery";
import {
  generateAndSaveImages,
  getCurrentUserId,
} from "@/features/generation/lib/generation-service";
import type { GeneratedImageData } from "@/features/generation/types";

export default function CoordinatePage() {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (data: {
    prompt: string;
    sourceImage?: File;
    backgroundChange: boolean;
    count: number;
  }) => {
    setIsGenerating(true);
    setError(null);
    setGeneratingCount(data.count);
    setCompletedCount(0);
    setGeneratedImages([]); // 既存の画像をクリア

    try {
      // ユーザーIDを取得（開発モード: NULLが返る）
      const userId = await getCurrentUserId();

      // 画像を生成し、Supabase Storageとデータベースに保存
      const result = await generateAndSaveImages({
        prompt: data.prompt,
        sourceImage: data.sourceImage,
        backgroundChange: data.backgroundChange,
        count: data.count,
        userId,
      });

      setGeneratedImages(result.images);
      setCompletedCount(result.images.length);

      // 開発モード通知
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            コーディネート画面
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            人物画像をアップロードして、AIで着せ替えを楽しもう
          </p>
        </div>

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
      </div>
    </div>
  );
}


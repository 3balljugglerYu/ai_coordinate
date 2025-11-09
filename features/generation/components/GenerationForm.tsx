"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ImageUploader } from "./ImageUploader";
import type { UploadedImage } from "../types";

interface GenerationFormProps {
  onSubmit: (data: {
    prompt: string;
    sourceImage?: File;
    backgroundChange: boolean;
    count: number;
  }) => void;
  isGenerating?: boolean;
}

export function GenerationForm({
  onSubmit,
  isGenerating = false,
}: GenerationFormProps) {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [backgroundChange, setBackgroundChange] = useState(false);
  const [selectedCount, setSelectedCount] = useState(1);

  const handleSubmit = () => {
    if (!prompt.trim()) {
      alert("着せ替え内容を入力してください");
      return;
    }

    if (!uploadedImage) {
      alert("人物画像をアップロードしてください");
      return;
    }

    onSubmit({
      prompt: prompt.trim(),
      sourceImage: uploadedImage.file,
      backgroundChange,
      count: selectedCount,
    });
  };

  const isSubmitDisabled = !prompt.trim() || !uploadedImage || isGenerating;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* 画像アップロード */}
        <ImageUploader
          onImageUpload={setUploadedImage}
          onImageRemove={() => setUploadedImage(null)}
        />

        {/* 着せ替え内容入力 */}
        <div>
          <Label htmlFor="prompt" className="text-base font-medium">
            着せ替え内容を入力
          </Label>
          <Textarea
            id="prompt"
            placeholder="例: 夏らしい白いワンピースを着せてください"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="mt-2 min-h-[100px]"
            disabled={isGenerating}
          />
          <p className="mt-1 text-xs text-gray-500">
            どんな服装に変更したいか具体的に記入してください
          </p>
        </div>

        {/* 背景変更オプション */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="background-change"
            checked={backgroundChange}
            onCheckedChange={(checked) => setBackgroundChange(checked === true)}
            disabled={isGenerating}
          />
          <Label
            htmlFor="background-change"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            背景も変更
          </Label>
        </div>

        {/* 生成枚数選択 */}
        <div>
          <Label className="text-base font-medium">生成枚数を選択</Label>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((count) => (
              <Button
                key={count}
                type="button"
                variant={selectedCount === count ? "default" : "outline"}
                onClick={() => setSelectedCount(count)}
                disabled={isGenerating}
                className="h-12"
              >
                {count}枚
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {selectedCount}枚の生成には {selectedCount * 10} クレジットが必要です
          </p>
        </div>

        {/* 生成ボタン */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
        >
          {isGenerating ? (
            <>
              <Sparkles className="mr-2 h-5 w-5 animate-pulse" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              コーデスタート
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}


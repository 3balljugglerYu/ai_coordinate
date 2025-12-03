"use client";

import { useState } from "react";
import { Sparkles, Upload, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ImageUploader } from "./ImageUploader";
import { StockImageUploader } from "./StockImageUploader";
import { StockImageList } from "./StockImageList";
import { GeneratedImagesFromSource } from "./GeneratedImagesFromSource";
import type { UploadedImage } from "../types";
import type { SourceImageStock } from "../lib/database";

interface GenerationFormProps {
  onSubmit: (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    backgroundChange: boolean;
    count: number;
  }) => void;
  isGenerating?: boolean;
}

type ImageSourceType = "upload" | "stock";

export function GenerationForm({
  onSubmit,
  isGenerating = false,
}: GenerationFormProps) {
  const [imageSourceType, setImageSourceType] = useState<ImageSourceType>("upload");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [selectedStock, setSelectedStock] = useState<SourceImageStock | null>(null);
  const [prompt, setPrompt] = useState("");
  const [backgroundChange, setBackgroundChange] = useState(false);
  const [selectedCount, setSelectedCount] = useState(1);
  const [stockListKey, setStockListKey] = useState(0); // StockImageListの再読み込み用

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      alert("着せ替え内容を入力してください");
      return;
    }

    if (imageSourceType === "upload" && !uploadedImage) {
      alert("人物画像をアップロードしてください");
      return;
    }

    if (imageSourceType === "stock" && !selectedStock) {
      alert("ストック画像を選択してください");
      return;
    }

    // ストック画像の場合、画像ファイルを取得する必要がある
    // ただし、生成APIではBase64が必要なので、URLから画像を取得する必要がある
    // 現時点では、ストック画像IDを渡して、サーバー側で処理する方針とする
    onSubmit({
      prompt: prompt.trim(),
      sourceImage: imageSourceType === "upload" ? uploadedImage?.file : undefined,
      sourceImageStockId: imageSourceType === "stock" ? selectedStock?.id : undefined,
      backgroundChange,
      count: selectedCount,
    });
  };

  const hasSourceImage = imageSourceType === "upload" ? !!uploadedImage : !!selectedStock;
  const isSubmitDisabled = !prompt.trim() || !hasSourceImage || isGenerating;

  const handleStockSelect = (stock: SourceImageStock) => {
    setSelectedStock(stock);
    // ストック選択時はローカルアップロードをクリア
    setUploadedImage(null);
  };

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image);
    // ローカルアップロード時はストック選択をクリア
    setSelectedStock(null);
  };

  const handleStockUploadSuccess = (stockId: string) => {
    // ストック画像アップロード成功時、リストを再読み込み
    setStockListKey((prev) => prev + 1);
    // アップロードしたストック画像を自動選択
    // StockImageListが再読み込みされるので、手動で選択してもらう
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* 画像ソース選択タブ */}
        <div>
          <Label className="text-base font-medium mb-3 block">
            元画像の選択方法
          </Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={imageSourceType === "upload" ? "default" : "outline"}
              onClick={() => {
                setImageSourceType("upload");
                setSelectedStock(null);
              }}
              disabled={isGenerating}
              className="flex-1"
            >
              <Upload className="mr-2 h-4 w-4" />
              ローカルからアップロード
            </Button>
            <Button
              type="button"
              variant={imageSourceType === "stock" ? "default" : "outline"}
              onClick={() => {
                setImageSourceType("stock");
                setUploadedImage(null);
              }}
              disabled={isGenerating}
              className="flex-1"
            >
              <Folder className="mr-2 h-4 w-4" />
              ストックから選択
            </Button>
          </div>
        </div>

        {/* 画像アップロード or ストック選択 */}
        {imageSourceType === "upload" ? (
          <>
            <ImageUploader
              onImageUpload={handleImageUpload}
              onImageRemove={() => setUploadedImage(null)}
            />
            {uploadedImage && (
              <div className="mt-4">
                <GeneratedImagesFromSource
                  stockId={null}
                  storagePath={null}
                  // ローカルアップロードの場合、storage_pathはまだないので後で実装
                  // 現時点ではストック画像選択時のみ表示
                />
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {selectedStock ? (
              <>
                <div>
                  <Label className="text-base font-medium mb-3 block">
                    選択中のストック画像
                  </Label>
                  <Card className="relative overflow-hidden">
                    <div className="relative aspect-video">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedStock.image_url}
                        alt={selectedStock.name || "選択されたストック画像"}
                        className="w-full h-full object-contain"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => setSelectedStock(null)}
                        disabled={isGenerating}
                      >
                        ×
                      </Button>
                    </div>
                    {selectedStock.name && (
                      <div className="p-3 bg-gray-50">
                        <p className="text-sm text-gray-700">{selectedStock.name}</p>
                      </div>
                    )}
                  </Card>
                </div>
                <div>
                  <GeneratedImagesFromSource
                    stockId={selectedStock.id}
                    storagePath={selectedStock.storage_path}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-base font-medium mb-3 block">
                    ストック画像をアップロード
                  </Label>
                  <StockImageUploader
                    onUploadSuccess={handleStockUploadSuccess}
                    onUploadError={(error) => {
                      console.error("Stock upload error:", error);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-base font-medium mb-3 block">
                    ストック画像一覧から選択
                  </Label>
                  <div className="max-h-[400px] overflow-y-auto">
                    <StockImageList
                      key={stockListKey}
                      onSelect={handleStockSelect}
                      onDelete={() => {
                        // 削除時もリストを再読み込み
                        setStockListKey((prev) => prev + 1);
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

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


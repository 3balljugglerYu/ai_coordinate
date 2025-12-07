"use client";

import { useState, useEffect } from "react";
import { Sparkles, Upload, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ImageUploader } from "./ImageUploader";
import { StockImageUploadCard } from "./StockImageUploadCard";
import { StockImageListClient } from "./StockImageListClient";
import { GeneratedImagesFromSource } from "./GeneratedImagesFromSource";
import { getStockImageLimit, getCurrentStockImageCount } from "../lib/database";
import type { UploadedImage } from "../types";
import type { SourceImageStock } from "../lib/database";
import { useRouter } from "next/navigation";

interface GenerationFormProps {
  onSubmit: (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    backgroundChange: boolean;
    count: number;
  }) => void;
  isGenerating?: boolean;
  initialStocks?: SourceImageStock[];
}

type ImageSourceType = "upload" | "stock";

export function GenerationForm({
  onSubmit,
  isGenerating = false,
  initialStocks = [],
}: GenerationFormProps) {
  const [imageSourceType, setImageSourceType] = useState<ImageSourceType>("upload");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [selectedStock, setSelectedStock] = useState<SourceImageStock | null>(null);
  const [prompt, setPrompt] = useState("");
  const [backgroundChange, setBackgroundChange] = useState(false);
  const [selectedCount, setSelectedCount] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [stockLimit, setStockLimit] = useState<number | null>(null);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const router = useRouter();

  // ストック画像制限数を取得（初回マウント時とrefreshTrigger変更時）
  useEffect(() => {
    const fetchLimit = async () => {
      try {
        const limit = await getStockImageLimit();
        const count = await getCurrentStockImageCount();
        setStockLimit(limit);
        setCurrentCount(count);
      } catch (err) {
        console.error("Failed to fetch stock limit:", err);
      }
    };
    fetchLimit();
  }, [refreshTrigger]);

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

  const handleStockSelect = (stock: SourceImageStock | null) => {
    setSelectedStock(stock);
    // ストック選択時はローカルアップロードをクリア
    if (stock) {
      setUploadedImage(null);
    }
  };

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image);
    // ローカルアップロード時はストック選択をクリア
    setSelectedStock(null);
  };

  const handleStockUploadSuccess = (stockId: string) => {
    // リフレッシュトリガーを更新してStockImageUploadCardの制限数を再取得
    setRefreshTrigger((prev) => prev + 1);
    // サーバーコンポーネントを再レンダリングしてデータを同期
    router.refresh();
  };

  const handleStockDelete = () => {
    // 削除された画像が選択されていた場合は選択を解除
    setSelectedStock(null);
    // リフレッシュトリガーを更新してStockImageUploadCardの制限数を再取得
    setRefreshTrigger((prev) => prev + 1);
    // router.refresh()はStockImageListClient内で呼び出される
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
              ライプラリ
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
              ストック
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
            <div>
              <Label className="text-base font-medium mb-3 block">
                ストック画像
              </Label>
              <StockImageListClient
                stocks={initialStocks}
                selectedStockId={selectedStock?.id || null}
                onSelect={handleStockSelect}
                onDelete={handleStockDelete}
                onRefreshTrigger={() => setRefreshTrigger((prev) => prev + 1)}
                renderUploadCard={() => (
                  <StockImageUploadCard
                    stockLimit={stockLimit}
                    currentCount={currentCount}
                    onUploadSuccess={handleStockUploadSuccess}
                    onUploadError={(error) => {
                      console.error("Stock upload error:", error);
                      alert(error);
                    }}
                  />
                )}
              />
              {selectedStock && (
                <div className="mt-4">
                  <GeneratedImagesFromSource
                    stockId={selectedStock.id}
                    storagePath={selectedStock.storage_path}
                  />
                </div>
              )}
            </div>
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


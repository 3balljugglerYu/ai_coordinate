"use client";

import { useState, useEffect } from "react";
import { Sparkles, Upload, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "./ImageUploader";
import { StockImageListClient } from "./StockImageListClient";
import { StockImageUploadCard } from "./StockImageUploadCard";
import { GeneratedImagesFromSource } from "./GeneratedImagesFromSource";
import { getSourceImageStocks, getStockImageLimit, type SourceImageStock } from "../lib/database";
import { getCurrentUserId } from "../lib/generation-service";
import { getCreditCost } from "../lib/model-config";
import type { UploadedImage, GeminiModel } from "../types";
import { useRouter } from "next/navigation";

interface GenerationFormProps {
  onSubmit: (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    backgroundChange: boolean;
    count: number;
    model: GeminiModel;
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
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [backgroundChange, setBackgroundChange] = useState(false);
  const [selectedCount, setSelectedCount] = useState(1);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash-image');
  const router = useRouter();
  const [stocks, setStocks] = useState<SourceImageStock[]>([]);
  const [stockLimit, setStockLimit] = useState<number | null>(null);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [isLoadingStocks, setIsLoadingStocks] = useState(true);

  // localStorageから選択されたストック画像IDを取得
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedId = localStorage.getItem("selectedStockId");
      if (storedId) {
        setSelectedStockId(storedId);
      }
    }
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      alert("着せ替え内容を入力してください");
      return;
    }

    if (imageSourceType === "upload" && !uploadedImage) {
      alert("人物画像をアップロードしてください");
      return;
    }

    if (imageSourceType === "stock" && !selectedStockId) {
      alert("ストック画像を選択してください");
      return;
    }

    // ストック画像の場合、画像ファイルを取得する必要がある
    // ただし、生成APIではBase64が必要なので、URLから画像を取得する必要がある
    // 現時点では、ストック画像IDを渡して、サーバー側で処理する方針とする
    onSubmit({
      prompt: prompt.trim(),
      sourceImage: imageSourceType === "upload" ? uploadedImage?.file : undefined,
      sourceImageStockId: imageSourceType === "stock" ? (selectedStockId || undefined) : undefined,
      backgroundChange,
      count: selectedCount,
      model: selectedModel,
    });
  };

  const hasSourceImage = imageSourceType === "upload" ? !!uploadedImage : !!selectedStockId;
  const isSubmitDisabled = !prompt.trim() || !hasSourceImage || isGenerating;

  // localStorageの変更を監視
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = () => {
        const storedId = localStorage.getItem("selectedStockId");
        setSelectedStockId(storedId);
      };
      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, []);

  // ストック画像と制限数を取得
  useEffect(() => {
    const fetchStocks = async () => {
      try {
        setIsLoadingStocks(true);
        const userId = await getCurrentUserId();
        if (!userId) {
          setIsLoadingStocks(false);
          return;
        }
        const [stocksData, limit] = await Promise.all([
          getSourceImageStocks(50, 0),
          getStockImageLimit(),
        ]);
        setStocks(stocksData);
        setStockLimit(limit);
        setCurrentCount(stocksData.length);
      } catch (error) {
        console.error("Failed to fetch stocks:", error);
      } finally {
        setIsLoadingStocks(false);
      }
    };
    void fetchStocks();
  }, []);

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image);
    // ローカルアップロード時はストック選択をクリア
    setSelectedStockId(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("selectedStockId");
    }
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
                setSelectedStockId(null);
                if (typeof window !== "undefined") {
                  localStorage.removeItem("selectedStockId");
                }
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
              {isLoadingStocks ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px]">
                      <div className="aspect-square animate-pulse rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              ) : (
                <StockImageListClient
                  stocks={stocks}
                  selectedStockId={selectedStockId}
                  onSelect={(stock) => {
                    if (stock) {
                      setSelectedStockId(stock.id);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("selectedStockId", stock.id);
                        window.dispatchEvent(new Event("storage"));
                      }
                    } else {
                      setSelectedStockId(null);
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("selectedStockId");
                        window.dispatchEvent(new Event("storage"));
                      }
                    }
                  }}
                  onDelete={(stockId) => {
                    if (selectedStockId === stockId) {
                      setSelectedStockId(null);
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("selectedStockId");
                      }
                    }
                    // ストックリストから削除
                    setStocks((prev) => prev.filter((s) => s.id !== stockId));
                    setCurrentCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
                  }}
                  onRefreshTrigger={async () => {
                    // ストックリストを再取得
                    try {
                      const userId = await getCurrentUserId();
                      if (userId) {
                        const [stocksData, limit] = await Promise.all([
                          getSourceImageStocks(50, 0),
                          getStockImageLimit(),
                        ]);
                        setStocks(stocksData);
                        setStockLimit(limit);
                        setCurrentCount(stocksData.length);
                      }
                    } catch (error) {
                      console.error("Failed to refresh stocks:", error);
                    }
                  }}
                  renderUploadCard={() => (
                    stockLimit !== null && currentCount !== null ? (
                      <StockImageUploadCard
                        stockLimit={stockLimit}
                        currentCount={currentCount}
                        onUploadSuccess={async () => {
                          // ストックリストを再取得
                          try {
                            const userId = await getCurrentUserId();
                            if (userId) {
                              const [stocksData, limit] = await Promise.all([
                                getSourceImageStocks(50, 0),
                                getStockImageLimit(),
                              ]);
                              setStocks(stocksData);
                              setStockLimit(limit);
                              setCurrentCount(stocksData.length);
                            }
                          } catch (error) {
                            console.error("Failed to refresh stocks:", error);
                          }
                        }}
                        onUploadError={(error) => {
                          console.error("Stock upload error:", error);
                          alert(error);
                        }}
                      />
                    ) : null
                  )}
                />
              )}
              {selectedStockId && (
                <div className="mt-4">
                  <GeneratedImagesFromSource
                    stockId={selectedStockId}
                    storagePath={null}
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

        {/* モデル選択 */}
        <div>
          <Label className="text-base font-medium mb-3 block">
            生成モデルを選択
          </Label>
          <Select
            value={selectedModel}
            onValueChange={(value) => setSelectedModel(value as GeminiModel)}
            disabled={isGenerating}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash-image">
                標準モデル（20クレジット/枚）
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-1k">
                高精度モデル_1K（50クレジット/枚）
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-2k">
                高精度モデル_2K（80クレジット/枚）
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-4k">
                高精度モデル_4K（100クレジット/枚）
              </SelectItem>
            </SelectContent>
          </Select>
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
            {selectedCount}枚の生成には {selectedCount * getCreditCost(selectedModel)} クレジットが必要です
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


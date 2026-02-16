"use client";

import { useState, useEffect, useCallback } from "react";
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
import { getPercoinCost } from "../lib/model-config";
import type { UploadedImage, GeminiModel } from "../types";
import { useRouter } from "next/navigation";
import { TUTORIAL_DEMO_IMAGE_PATH } from "@/features/tutorial/lib/constants";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

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
  const [isTutorialInProgress, setIsTutorialInProgress] = useState(false);

  // チュートリアル中は入力フィールドを無効化（bodyのdata-tour-in-progressを監視）
  useEffect(() => {
    if (typeof document === "undefined") return;
    const checkTutorial = () => {
      setIsTutorialInProgress(
        document.body.getAttribute("data-tour-in-progress") === "true"
      );
    };
    checkTutorial();
    const observer = new MutationObserver(checkTutorial);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-tour-in-progress"],
    });
    return () => observer.disconnect();
  }, []);

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

    // チュートリアル中: コーデスタート押下でStep8へ進む
    if (
      typeof document !== "undefined" &&
      sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS) === "true"
    ) {
      document.dispatchEvent(
        new CustomEvent("tutorial:advance-to-next", { bubbles: true })
      );
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

  const handleImageUpload = useCallback((image: UploadedImage) => {
    setUploadedImage(image);
    setSelectedStockId(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("selectedStockId");
    }
  }, []);

  // チュートリアルモード: プロンプトをセット（step4のonHighlightedで自動セット）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (detail?.prompt) setPrompt(detail.prompt);
    };
    document.addEventListener("tutorial:set-prompt", handler);
    return () => document.removeEventListener("tutorial:set-prompt", handler);
  }, []);

  // チュートリアルモード: 背景変更チェックをセット（step5のonHighlightedで自動セット）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ checked: boolean }>).detail;
      if (detail?.checked) setBackgroundChange(true);
    };
    document.addEventListener("tutorial:set-background-change", handler);
    return () =>
      document.removeEventListener("tutorial:set-background-change", handler);
  }, []);

  // チュートリアル中断時: フォームを初期状態にクリア（デモ画像・プロンプト・背景変更等をリセット）
  useEffect(() => {
    const handler = () => {
      setUploadedImage(null);
      setSelectedStockId(null);
      setPrompt("");
      setBackgroundChange(false);
      setSelectedCount(1);
      setSelectedModel("gemini-2.5-flash-image");
      setImageSourceType("upload");
      if (typeof window !== "undefined") {
        localStorage.removeItem("selectedStockId");
      }
    };
    document.addEventListener("tutorial:clear", handler);
    return () => document.removeEventListener("tutorial:clear", handler);
  }, []);

  // チュートリアルモード: デモ画像を自動セット（ステップ表示時に onHighlighted で発火）
  useEffect(() => {
    const handler = async () => {
      try {
        const res = await fetch(TUTORIAL_DEMO_IMAGE_PATH);
        const blob = await res.blob();
        const file = new File([blob], "tutorial-demo.jpg", {
          type: blob.type || "image/jpeg",
        });
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          handleImageUpload({
            file,
            previewUrl: objectUrl,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 800,
          });
          setImageSourceType("upload");
        };
        img.src = objectUrl;
      } catch (err) {
        console.error("[Tutorial] Failed to set demo image:", err);
      }
    };
    document.addEventListener("tutorial:set-demo-image", handler);
    return () => document.removeEventListener("tutorial:set-demo-image", handler);
  }, [handleImageUpload]);

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
              ライブラリ
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
          <div>
            <ImageUploader
              onImageUpload={handleImageUpload}
              onImageRemove={() => setUploadedImage(null)}
              value={uploadedImage}
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
          </div>
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
        <div data-tour="tour-prompt-input">
          <Label htmlFor="prompt" className="text-base font-medium">
            着せ替え内容を入力
          </Label>
          <Textarea
            id="prompt"
            placeholder="例: 夏らしい白いワンピースを着せてください"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="mt-2 min-h-[100px]"
            disabled={isGenerating || isTutorialInProgress}
          />
          <p className="mt-1 text-xs text-gray-500">
            どんな服装に変更したいか具体的に記入してください
          </p>
        </div>

        {/* 背景変更オプション */}
        <div className="flex items-center space-x-2" data-tour="tour-background-change">
          <Checkbox
            id="background-change"
            checked={backgroundChange}
            onCheckedChange={(checked) => setBackgroundChange(checked === true)}
            disabled={isGenerating || isTutorialInProgress}
          />
          <Label
            htmlFor="background-change"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            背景も変更
          </Label>
        </div>

        {/* モデル選択 */}
        <div data-tour="tour-model-select">
          <Label className="text-base font-medium mb-3 block">
            生成モデルを選択
          </Label>
          <Select
            value={selectedModel}
            onValueChange={(value) => setSelectedModel(value as GeminiModel)}
            disabled={isGenerating || isTutorialInProgress}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash-image">
                標準モデル（20ペルコイン/枚）
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-1k">
                高精度モデル_1K（50ペルコイン/枚）
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-2k">
                高精度モデル_2K（80ペルコイン/枚）
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-4k">
                高精度モデル_4K（100ペルコイン/枚）
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 生成枚数選択 */}
        <div data-tour="tour-count-select">
          <Label className="text-base font-medium mb-3 block">
            生成枚数を選択
          </Label>
          <div className="mt-2 grid grid-cols-4 gap-2 items-end">
            <Button
              type="button"
              variant={selectedCount === 1 ? "default" : "outline"}
              onClick={() => setSelectedCount(1)}
              disabled={isGenerating || isTutorialInProgress}
              className="h-12"
            >
              1枚
            </Button>
            {[2, 3, 4].map((count) => (
              <Button
                key={count}
                type="button"
                variant={selectedCount === count ? "default" : "outline"}
                onClick={() => setSelectedCount(count)}
                disabled={isGenerating || isTutorialInProgress}
                className="h-12"
              >
                {count}枚
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {selectedCount}枚の生成には {selectedCount * getPercoinCost(selectedModel)} ペルコインが必要です
          </p>
        </div>

        {/* 生成ボタン */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          data-tour="tour-generate-btn"
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

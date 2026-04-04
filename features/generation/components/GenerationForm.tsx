"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Lock, Sparkles, Upload, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ImageUploader } from "./ImageUploader";
import { StockImageListClient } from "./StockImageListClient";
import { StockImageUploadCard } from "./StockImageUploadCard";
import { GeneratedImagesFromSource } from "./GeneratedImagesFromSource";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import {
  getMaxGenerationCount,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import { getSourceImageStocks, getStockImageLimit, type SourceImageStock } from "../lib/database";
import { getCurrentUserId } from "../lib/current-user";
import { getPercoinCost } from "../lib/model-config";
import {
  GENERATION_PROMPT_MAX_LENGTH,
  isGenerationPromptTooLong,
} from "../lib/prompt-validation";
import type {
  UploadedImage,
  GeminiModel,
  BackgroundMode,
  SourceImageType,
} from "../types";
import { TUTORIAL_DEMO_IMAGE_PATH } from "@/features/tutorial/lib/constants";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

interface GenerationFormProps {
  subscriptionPlan: SubscriptionPlan;
  onSubmit: (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    sourceImageType?: SourceImageType;
    backgroundMode: BackgroundMode;
    count: number;
    model: GeminiModel;
  }) => void;
  isGenerating?: boolean;
}

type ImageSourceType = "upload" | "stock";
type BackgroundModeOption = {
  value: BackgroundMode;
  label: string;
  description: string;
};

export function GenerationForm({
  subscriptionPlan,
  onSubmit,
  isGenerating = false,
}: GenerationFormProps) {
  const t = useTranslations("coordinate");
  const subscriptionT = useTranslations("subscription");
  const backgroundModeOptions: BackgroundModeOption[] = [
    {
      value: "ai_auto",
      label: t("backgroundAiAutoLabel"),
      description: t("backgroundAiAutoDescription"),
    },
    {
      value: "include_in_prompt",
      label: t("backgroundIncludeInPromptLabel"),
      description: t("backgroundIncludeInPromptDescription"),
    },
    {
      value: "keep",
      label: t("backgroundKeepLabel"),
      description: t("backgroundKeepDescription"),
    },
  ];
  const sourceImageTypeOptions: Array<{
    value: SourceImageType;
    label: string;
  }> = [
    { value: "illustration", label: t("sourceImageTypeIllustration") },
    { value: "real", label: t("sourceImageTypeReal") },
  ];
  const [imageSourceType, setImageSourceType] = useState<ImageSourceType>("upload");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [sourceImageType, setSourceImageType] = useState<SourceImageType>("illustration");
  const [prompt, setPrompt] = useState("");
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("keep");
  const [selectedCount, setSelectedCount] = useState(1);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    "gemini-3.1-flash-image-preview-512"
  );
  const [stocks, setStocks] = useState<SourceImageStock[]>([]);
  const [stockLimit, setStockLimit] = useState<number | null>(null);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [isLoadingStocks, setIsLoadingStocks] = useState(true);
  const [isTutorialInProgress, setIsTutorialInProgress] = useState(false);
  const [isUpsellOpen, setIsUpsellOpen] = useState(false);
  const promptLength = prompt.length;
  const isPromptTooLong = isGenerationPromptTooLong(prompt);
  const maxGenerationCount = getMaxGenerationCount(subscriptionPlan);

  useEffect(() => {
    setSelectedCount((current) => Math.min(current, maxGenerationCount));
  }, [maxGenerationCount]);

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
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      alert(t("missingPrompt"));
      return;
    }

    if (isPromptTooLong) {
      alert(t("promptTooLong", { max: GENERATION_PROMPT_MAX_LENGTH }));
      return;
    }

    if (imageSourceType === "upload" && !uploadedImage) {
      alert(t("missingUploadedImage"));
      return;
    }

    if (imageSourceType === "stock" && !selectedStockId) {
      alert(t("missingStockImage"));
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
      prompt: trimmedPrompt,
      sourceImage: imageSourceType === "upload" ? uploadedImage?.file : undefined,
      sourceImageStockId: imageSourceType === "stock" ? (selectedStockId || undefined) : undefined,
      sourceImageType,
      backgroundMode,
      count: Math.min(selectedCount, maxGenerationCount),
      model: selectedModel,
    });
  };

  const hasSourceImage = imageSourceType === "upload" ? !!uploadedImage : !!selectedStockId;
  const isSubmitDisabled =
    !prompt.trim() || !hasSourceImage || isGenerating || isPromptTooLong;

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

  // チュートリアルモード: 背景設定をセット（step5のonHighlightedで自動セット）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: BackgroundMode }>).detail;
      if (
        detail?.mode === "ai_auto" ||
        detail?.mode === "include_in_prompt" ||
        detail?.mode === "keep"
      ) {
        setBackgroundMode(detail.mode);
      }
    };
    document.addEventListener("tutorial:set-background-mode", handler);
    return () =>
      document.removeEventListener("tutorial:set-background-mode", handler);
  }, []);

  // チュートリアル中断時: フォームを初期状態にクリア（デモ画像・プロンプト・背景設定等をリセット）
  useEffect(() => {
    const handler = () => {
      setUploadedImage(null);
      setSelectedStockId(null);
      setSourceImageType("illustration");
      setPrompt("");
      setBackgroundMode("keep");
      setSelectedCount(1);
      setSelectedModel("gemini-3.1-flash-image-preview-512");
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

  const handleCountSelection = (count: number) => {
    if (isGenerating || isTutorialInProgress) {
      return;
    }

    if (count > maxGenerationCount) {
      setIsUpsellOpen(true);
      return;
    }

    setSelectedCount(count);
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* 画像ソース選択タブ */}
        <div>
          <Label className="text-base font-medium mb-3 block">
            {t("imageSourceLabel")}
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
              {t("libraryTab")}
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
              {t("stockTab")}
            </Button>
          </div>
        </div>

        {/* 画像アップロード or ストック選択 */}
        {imageSourceType === "upload" ? (
          <div className="space-y-4">
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
                {t("stockImagesLabel")}
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

        <div>
          <Label className="text-base font-medium block">
            {t("sourceImageTypeLabel")}
          </Label>
          <RadioGroup
            value={sourceImageType}
            onValueChange={(value) => setSourceImageType(value as SourceImageType)}
            className="mt-2 flex items-center gap-6"
            disabled={isGenerating || isTutorialInProgress}
          >
            {sourceImageTypeOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  id={`source-image-type-${option.value}`}
                  value={option.value}
                />
                <Label
                  htmlFor={`source-image-type-${option.value}`}
                  className="text-sm font-medium leading-none"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* 着せ替え内容入力 */}
        <div data-tour="tour-prompt-input">
          <Label htmlFor="prompt" className="text-base font-medium">
            {t("promptLabel")}
          </Label>
          <Textarea
            id="prompt"
            placeholder={t("promptPlaceholder")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="mt-2 min-h-[100px]"
            maxLength={GENERATION_PROMPT_MAX_LENGTH}
            aria-invalid={isPromptTooLong}
            disabled={isGenerating || isTutorialInProgress}
          />
          <p className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>
              {t("promptHint", { max: GENERATION_PROMPT_MAX_LENGTH })}
            </span>
            <span
              className={
                promptLength >= GENERATION_PROMPT_MAX_LENGTH
                  ? "font-medium tabular-nums text-amber-600"
                  : "tabular-nums"
              }
            >
              {t("promptCharacterCount", {
                current: promptLength,
                max: GENERATION_PROMPT_MAX_LENGTH,
              })}
            </span>
          </p>
        </div>

        {/* 背景設定 */}
        <div data-tour="tour-background-change">
          <Label className="text-base font-medium">{t("backgroundLabel")}</Label>
          <RadioGroup
            value={backgroundMode}
            onValueChange={(value) => setBackgroundMode(value as BackgroundMode)}
            className="mt-2 space-y-3"
            disabled={isGenerating || isTutorialInProgress}
          >
            {backgroundModeOptions.map((option) => (
              <div key={option.value} className="flex items-start space-x-2">
                <RadioGroupItem
                  id={`background-mode-${option.value}`}
                  value={option.value}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`background-mode-${option.value}`}
                    className="text-sm font-medium leading-none"
                  >
                    {option.label}
                  </Label>
                  <p className="text-xs text-gray-500">
                    {option.description}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* モデル選択 */}
        <div data-tour="tour-model-select">
          <Label className="text-base font-medium mb-3 block">
            {t("modelLabel")}
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
              <SelectItem value="gemini-3.1-flash-image-preview-512">
                {t("modelLight05k")}
              </SelectItem>
              <SelectItem value="gemini-3.1-flash-image-preview-1024">
                {t("modelStandard1k")}
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-1k">
                {t("modelPro1k")}
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-2k">
                {t("modelPro2k")}
              </SelectItem>
              <SelectItem value="gemini-3-pro-image-4k">
                {t("modelPro4k")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 生成枚数選択 */}
        <div data-tour="tour-count-select">
          <Label className="text-base font-medium mb-3 block">
            {t("countLabel")}
          </Label>
          <div className="mt-2 grid grid-cols-4 gap-2 items-end">
            <Button
              type="button"
              variant={selectedCount === 1 ? "default" : "outline"}
              onClick={() => handleCountSelection(1)}
              disabled={isGenerating || isTutorialInProgress}
              className="h-12"
            >
              {t("countSingle")}
            </Button>
            {[2, 3, 4].map((count) => (
              <Button
                key={count}
                type="button"
                variant={selectedCount === count ? "default" : "outline"}
                onClick={() => handleCountSelection(count)}
                disabled={isGenerating || isTutorialInProgress}
                aria-disabled={count > maxGenerationCount}
                className={cn(
                  "h-12",
                  count > maxGenerationCount &&
                    "relative border-dashed text-gray-400 hover:bg-background hover:text-gray-400"
                )}
              >
                {count > maxGenerationCount ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" />
                    {t("countMultiple", { count })}
                  </span>
                ) : (
                  t("countMultiple", { count })
                )}
              </Button>
            ))}
          </div>
          {maxGenerationCount < 4 ? (
            <p className="mt-2 text-xs text-amber-700">
              {subscriptionT("generationLimitHint", {
                count: maxGenerationCount,
              })}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">
            {t("countCostDescription", {
              count: selectedCount,
              amount: selectedCount * getPercoinCost(selectedModel),
            })}
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
              {t("generatingButtonLoading")}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              {t("generatingButton")}
            </>
          )}
        </Button>

        <SubscriptionUpsellDialog
          open={isUpsellOpen}
          onOpenChange={setIsUpsellOpen}
        />
      </div>
    </Card>
  );
}

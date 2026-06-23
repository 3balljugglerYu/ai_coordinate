"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { ImageUploader } from "./ImageUploader";
import { GenerationModelControls } from "./GenerationModelControls";
import { GenerationSubmitButton } from "./GenerationSubmitButton";
import { GeneratedImagesFromSource } from "./GeneratedImagesFromSource";
import { ImageSourcePicker } from "./ImageSourcePicker/ImageSourcePicker";
import { ImageSourcePickerTrigger } from "./ImageSourcePickerTrigger";
import { PromptInputField } from "./PromptInputField";
import { Textarea } from "@/components/ui/textarea";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import {
  getMaxGenerationCount,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import type { SourceImageStock } from "../lib/database";
import { useCoordinateStocksUnread } from "../hooks/useCoordinateStocksUnread";
import {
  getPercoinCost,
  isFreePlanAllowedModel,
  resolveEffectiveModelForAuthState,
} from "../lib/model-config";
import {
  readPreferredBackgroundMode,
  readPreferredModel,
  writePreferredBackgroundMode,
  writePreferredModel,
} from "../lib/form-preferences";
import {
  GENERATION_PROMPT_MAX_LENGTH,
  isGenerationPromptTooLong,
} from "../lib/prompt-validation";
import { DEFAULT_GENERATION_MODEL } from "../types";
import type {
  UploadedImage,
  GeminiModel,
  BackgroundMode,
  SourceImageType,
  PickerSourceItem,
} from "../types";
import type { FramingMode } from "@/shared/generation/framing-mode";
import { TUTORIAL_DEMO_IMAGE_PATH } from "@/features/tutorial/lib/constants";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";
import { useCurrentUrlForRedirect } from "@/lib/build-current-url";
import { useGenerationState } from "../context/GenerationStateContext";
import { clearCoordinateSourceStockSavePromptDot } from "../lib/coordinate-source-stock-save-prompt-state";
import {
  COORDINATE_APPLY_FROM_HISTORY_EVENT,
  COORDINATE_PENDING_SOURCE_IMAGE_KEY,
  type CoordinateApplyFromHistoryDetail,
} from "../lib/apply-from-history-event";
import { fetchSourceImageAsUploadedImage } from "../lib/source-image-to-file";
import { useImageSourcePicker } from "../hooks/useImageSourcePicker";

interface GenerationFormProps {
  subscriptionPlan: SubscriptionPlan;
  onSubmit: (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    /** 生成済み画像を入力 source として再利用する場合の id (排他) */
    sourceImageGeneratedId?: string;
    sourceImageType?: SourceImageType;
    backgroundMode: BackgroundMode;
    count: number;
    model: GeminiModel;
    /** framing_mode (admin viewer 限定)。チェック ON のときのみ "free_pose" が入る */
    framingMode?: FramingMode;
    /** ポーズ・カメラ指定 (admin viewer 限定)。free_pose かつ非空のときのみ入る */
    posePrompt?: string;
  }) => void;
  isGenerating?: boolean;
  /**
   * 認証状態。"guest" のときは LockableModelSelect で 4 モデルに南京錠を表示し、
   * クリックで AuthModal を開く。既定値は "authenticated"（既存の /coordinate ページ
   * は認証済みのみが入るため）。
   */
  authState?: "guest" | "authenticated";
  /**
   * ゲストが既に1枚生成済み(=本日の無料枠を消費済み)で、再生成を抑止したいとき true。
   * 再生成すると in-memory の結果が失われ上限エラーになるため、生成ボタンを無効化する。
   */
  guestGenerationLocked?: boolean;
  /**
   * framing_mode (free_pose) のチェックボックスを表示するか。
   * admin viewer 限定の先行公開 (サーバ側 generate-async でも検証される)。
   */
  canUseFreePose?: boolean;
}

type BackgroundModeOption = {
  value: BackgroundMode;
  label: string;
  description: string;
};

type GeneratedPickerItem = Extract<PickerSourceItem, { kind: "generated" }>;

export function GenerationForm({
  subscriptionPlan,
  onSubmit,
  isGenerating = false,
  authState = "authenticated",
  guestGenerationLocked = false,
  canUseFreePose = false,
}: GenerationFormProps) {
  const t = useTranslations("coordinate");
  const subscriptionT = useTranslations("subscription");
  // ポーズ・アングル指示欄のラベルは style 側の既存キーを再利用する。
  const styleT = useTranslations("style");
  const generationState = useGenerationState();
  const openStockTabRequestId = generationState?.openStockTabRequestId ?? 0;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const currentUrl = useCurrentUrlForRedirect();
  const lastHandledOpenStockTabRequestIdRef = useRef(0);
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
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [selectedStock, setSelectedStock] = useState<SourceImageStock | null>(
    null
  );
  /**
   * 生成済み画像をピッカーから選んだ場合、URL → File への変換と再アップロード
   * を行わず id のみ保持する。サーバ側 (/api/generate-async) で
   * sourceImageGeneratedId を受け、generated_images から URL を直接解決する。
   * uploadedImage / selectedStock とは排他。
   */
  const [selectedGenerated, setSelectedGenerated] =
    useState<GeneratedPickerItem | null>(null);
  const [sourceImageType, setSourceImageType] = useState<SourceImageType>("illustration");
  const [prompt, setPrompt] = useState("");
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("keep");
  // framing_mode (admin viewer 限定先行公開)。背景設定と同じ 3 択ラジオで
  // 「元画像に合わせる (locked) / プロンプト内で指定 (free_pose)」を選ぶ。
  // ゲスト同期経路は framingMode を解釈しないため、認証済みのときのみ表示する。
  // 既定は free(image_0 の同一性だけ維持し、衣装/ポーズ/カメラはユーザー指示に委ねる)。
  // 「ポーズ・カメラをできるだけ維持」チェックで locked に切り替える。
  const [poseMode, setPoseMode] = useState<FramingMode>("free_pose");
  const [posePromptValue, setPosePromptValue] = useState("");
  const POSE_PROMPT_MAX_LENGTH = 500;
  const shouldShowPoseModeControl =
    canUseFreePose && authState === "authenticated";
  const [selectedCount, setSelectedCount] = useState(1);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    DEFAULT_GENERATION_MODEL
  );
  const [isTutorialInProgress, setIsTutorialInProgress] = useState(false);
  const [isUpsellOpen, setIsUpsellOpen] = useState(false);
  const isAuthenticated = authState === "authenticated";
  const {
    hasDot: hasStockTabDot,
    markSeen: markStockTabSeen,
  } = useCoordinateStocksUnread({ enabled: isAuthenticated });

  // ピッカー: 「ストック」タブをアクティブにした瞬間に未読ドットを既読化する。
  const picker = useImageSourcePicker({
    defaultTab: "generated",
    onTabChange: (tab) => {
      if (tab === "stock" && isAuthenticated) {
        void markStockTabSeen();
      }
    },
  });

  const promptLength = prompt.length;
  const isPromptTooLong = isGenerationPromptTooLong(prompt);
  const maxGenerationCount = getMaxGenerationCount(subscriptionPlan);
  const effectiveSelectedModel = resolveEffectiveModelForAuthState(
    selectedModel,
    authState
  );
  const totalPercoinCost =
    selectedCount * getPercoinCost(effectiveSelectedModel);
  const showCost = authState === "authenticated";

  useEffect(() => {
    setSelectedCount((current) => Math.min(current, maxGenerationCount));
  }, [maxGenerationCount]);

  // ブラウザに保存された前回の選択 (モデル / 背景設定) を復元する。
  // SSR との hydration mismatch を避けるため初期値は default のまま、useEffect で上書きする。
  useEffect(() => {
    setSelectedModel(readPreferredModel());
    setBackgroundMode(readPreferredBackgroundMode());
  }, []);

  const handleSelectedModelChange = useCallback((value: GeminiModel) => {
    setSelectedModel(value);
    writePreferredModel(value);
  }, []);

  const handleBackgroundModeChange = useCallback((value: BackgroundMode) => {
    setBackgroundMode(value);
    writePreferredBackgroundMode(value);
  }, []);

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

  // 投稿後にホームで保存した場合のナビ赤丸は、コーディネート画面を開いた時点で既読扱いにする。
  useEffect(() => {
    clearCoordinateSourceStockSavePromptDot();
  }, []);

  // 「ストックタブを開け」リクエスト (SaveSourceImageToStockDialog が保存直後に発火)。
  // 新 UX ではピッカーを「ストック」タブで開く。
  useEffect(() => {
    const requestId = openStockTabRequestId;
    if (!isAuthenticated) return;
    if (requestId <= 0) return;
    if (lastHandledOpenStockTabRequestIdRef.current === requestId) return;

    lastHandledOpenStockTabRequestIdRef.current = requestId;
    picker.setActiveTab("stock");
    picker.setOpen(true);
  }, [openStockTabRequestId, isAuthenticated, picker]);

  const handleSubmit = async () => {
    const trimmedPrompt = prompt.trim();

    // free_pose + ポーズ欄入力 (服はそのまま・ポーズだけ変更) のときはコーデ指示が空でも許可。
    const poseOnlySubmit =
      shouldShowPoseModeControl &&
      poseMode === "free_pose" &&
      posePromptValue.trim().length > 0;

    if (!trimmedPrompt && !poseOnlySubmit) {
      alert(t("missingPrompt"));
      return;
    }

    if (isPromptTooLong) {
      alert(t("promptTooLong", { max: GENERATION_PROMPT_MAX_LENGTH }));
      return;
    }

    if (!uploadedImage && !selectedStock && !selectedGenerated) {
      alert(t("missingUploadedImage"));
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

    // ソース画像の入力は uploadedImage / stock / generated のいずれか 1 つ。
    // selectedStock / selectedGenerated が立っているときはサーバ側で id 経由
    // で URL を解決するため、sourceImage (File) は undefined を渡す。
    onSubmit({
      prompt: trimmedPrompt,
      sourceImage:
        selectedStock || selectedGenerated ? undefined : uploadedImage?.file,
      sourceImageStockId: selectedStock?.id,
      sourceImageGeneratedId: selectedGenerated?.id,
      sourceImageType,
      backgroundMode,
      count: Math.min(selectedCount, maxGenerationCount),
      model: effectiveSelectedModel,
      // framing_mode: locked 以外を選んだときのみ渡す (省略 = locked = 現行挙動)
      ...(shouldShowPoseModeControl && poseMode !== "locked"
        ? { framingMode: poseMode }
        : {}),
      // posePrompt: free_pose かつ入力があるときのみ渡す
      ...(shouldShowPoseModeControl &&
      poseMode === "free_pose" &&
      posePromptValue.trim()
        ? { posePrompt: posePromptValue.trim() }
        : {}),
    });
  };

  const hasSourceImage =
    !!uploadedImage || !!selectedStock || !!selectedGenerated;
  // 服はそのまま・ポーズだけ変更: free_pose でポーズ欄に入力があれば、コーデ指示が空でも生成可。
  const poseOnlyReady =
    shouldShowPoseModeControl &&
    poseMode === "free_pose" &&
    posePromptValue.trim().length > 0;
  const isSubmitDisabled =
    (!prompt.trim() && !poseOnlyReady) ||
    !hasSourceImage ||
    isGenerating ||
    isPromptTooLong ||
    guestGenerationLocked;

  const handleImageUpload = useCallback((image: UploadedImage) => {
    setUploadedImage(image);
    setSelectedStock(null);
    setSelectedGenerated(null);
  }, []);

  // uploadedImage.previewUrl が blob: の場合、差替時 (ImageUploader 内部で
  // 処理) と unmount 時の両方で revoke が必要。ImageUploader は controlled
  // モードでは unmount 時の revoke を抑止する設計 (親が URL ライフサイクル
  // を所有) のため、親側で cleanup を実装する。
  useEffect(() => {
    const currentUrl = uploadedImage?.previewUrl;
    return () => {
      if (currentUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [uploadedImage?.previewUrl]);

  const handleSelectStock = useCallback(
    (stock: SourceImageStock) => {
      setSelectedStock(stock);
      setUploadedImage(null);
      setSelectedGenerated(null);
      picker.closePicker();
    },
    [picker]
  );

  /**
   * 生成済み画像の選択: クライアントで URL を fetch せず、id だけ保持して
   * picker を閉じる。実体の取得はサーバ側 (generated_images.image_url) で
   * 完結するため、選択後ほぼゼロ待機で生成可能になる。
   */
  const handleSelectGenerated = useCallback(
    (item: GeneratedPickerItem) => {
      setSelectedGenerated(item);
      setUploadedImage(null);
      setSelectedStock(null);
      picker.closePicker();
    },
    [picker]
  );

  // チュートリアルモード: プロンプトをセット（step4のonHighlightedで自動セット）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (detail?.prompt) setPrompt(detail.prompt);
    };
    document.addEventListener("tutorial:set-prompt", handler);
    return () => document.removeEventListener("tutorial:set-prompt", handler);
  }, []);

  // 生成結果一覧の「次の生成に使う」/ /style からの遷移時に、
  // 画像 URL を受け取って人物アップロード欄に差し込む。
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<CoordinateApplyFromHistoryDetail>).detail;
      if (!detail?.imageUrl) return;
      try {
        const payload = await fetchSourceImageAsUploadedImage(detail.imageUrl, {
          fileNameHint: detail.fileNameHint ?? "coordinate-history",
        });
        handleImageUpload(payload);
      } catch (err) {
        console.error("[apply-from-history] 画像取得に失敗:", err);
      }
    };
    document.addEventListener(COORDINATE_APPLY_FROM_HISTORY_EVENT, handler);
    return () =>
      document.removeEventListener(
        COORDINATE_APPLY_FROM_HISTORY_EVENT,
        handler,
      );
  }, [handleImageUpload]);

  // /style → 「このイラストで生成」 → 確認 → /coordinate 遷移時に
  // sessionStorage に画像 URL が積まれていれば apply-from-history へ転送する。
  useEffect(() => {
    if (typeof window === "undefined") return;
    let pendingUrl: string | null = null;
    try {
      pendingUrl = window.sessionStorage.getItem(
        COORDINATE_PENDING_SOURCE_IMAGE_KEY,
      );
    } catch {
      return;
    }
    if (!pendingUrl) return;
    try {
      window.sessionStorage.removeItem(COORDINATE_PENDING_SOURCE_IMAGE_KEY);
    } catch {
      // 書き込み不可は無視
    }
    document.dispatchEvent(
      new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
        detail: { imageUrl: pendingUrl, fileNameHint: "style-history" },
      }),
    );
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

  // チュートリアル開始時は、前回の保存状態に関係なく既定モデルへ寄せる。
  useEffect(() => {
    const handler = () => {
      setSelectedStock(null);
      setSelectedGenerated(null);
      setSelectedModel(DEFAULT_GENERATION_MODEL);
    };
    document.addEventListener("tutorial:prepare-coordinate-state", handler);
    return () =>
      document.removeEventListener("tutorial:prepare-coordinate-state", handler);
  }, []);

  // チュートリアル中は Size step の対象を必ず表示するため、既定モデルへ寄せる。
  useEffect(() => {
    const handler = () => {
      setSelectedModel(DEFAULT_GENERATION_MODEL);
    };
    document.addEventListener("tutorial:set-gpt-image-2-default-model", handler);
    return () =>
      document.removeEventListener(
        "tutorial:set-gpt-image-2-default-model",
        handler
      );
  }, []);

  // チュートリアル中断時: フォームを初期状態にクリア
  useEffect(() => {
    const handler = () => {
      setUploadedImage(null);
      setSelectedStock(null);
      setSelectedGenerated(null);
      setSourceImageType("illustration");
      setPrompt("");
      setBackgroundMode("keep");
      setSelectedCount(1);
      setSelectedModel(DEFAULT_GENERATION_MODEL);
    };
    document.addEventListener("tutorial:clear", handler);
    return () => document.removeEventListener("tutorial:clear", handler);
  }, []);

  // チュートリアルモード: デモ画像を自動セット
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
        {/* 画像入力エリア: アップローダ常時表示 + ピッカートリガ */}
        <div className="space-y-3">
          <Label className="text-base font-medium block">
            {t("imageSourceLabel")}
          </Label>
          <ImageUploader
            onImageUpload={handleImageUpload}
            onImageRemove={() => {
              setUploadedImage(null);
              setSelectedStock(null);
              setSelectedGenerated(null);
            }}
            value={
              selectedStock
                ? {
                    // ストック選択時はリモート URL のみで preview を出す
                    // (file は使わないので渡さない)。
                    previewUrl: selectedStock.image_url,
                  }
                : selectedGenerated
                  ? {
                      // 生成済み画像選択時も同様に preview のみ表示する。
                      previewUrl: selectedGenerated.imageUrl,
                    }
                  : uploadedImage
            }
          />
          {selectedStock ? (
            <div>
              <GeneratedImagesFromSource
                stockId={selectedStock.id}
                storagePath={selectedStock.storage_path}
              />
            </div>
          ) : null}
          <ImageSourcePickerTrigger
            onClick={picker.openPicker}
            disabled={isGenerating || isTutorialInProgress}
            showUnreadDot={hasStockTabDot}
          />
        </div>

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
        <PromptInputField
          value={prompt}
          onChange={setPrompt}
          label={t("promptLabel")}
          placeholder={t("promptPlaceholder")}
          hint={t("promptHint", { max: GENERATION_PROMPT_MAX_LENGTH })}
          clearLabel={t("promptClear")}
          characterCount={t("promptCharacterCount", {
            current: promptLength,
            max: GENERATION_PROMPT_MAX_LENGTH,
          })}
          maxLength={GENERATION_PROMPT_MAX_LENGTH}
          invalid={isPromptTooLong}
          disabled={isGenerating || isTutorialInProgress}
          containerProps={{ "data-tour": "tour-prompt-input" }}
        />

        {/* 背景設定 */}
        <div data-tour="tour-background-change">
          <Label className="text-base font-medium">{t("backgroundLabel")}</Label>
          <RadioGroup
            value={backgroundMode}
            onValueChange={(value) =>
              handleBackgroundModeChange(value as BackgroundMode)
            }
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

        {/* ポーズ・アングル設定。既定は free(委ねる)。チェックで「できるだけ維持(locked)」 */}
        {shouldShowPoseModeControl ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
            <Label className="text-base font-medium">
              {t("poseModeLabel")}
            </Label>
            <div className="mt-2 flex items-start space-x-2">
              <Checkbox
                id="pose-preserve"
                checked={poseMode === "locked"}
                onCheckedChange={(checked) =>
                  setPoseMode(checked === true ? "locked" : "free_pose")
                }
                disabled={isGenerating || isTutorialInProgress}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="pose-preserve"
                  className="text-sm font-medium leading-none"
                >
                  {t("poseModeKeepLabel")}
                </Label>
                <p className="text-xs text-gray-500">
                  {t("poseModeKeepDescription")}
                </p>
              </div>
            </div>
            {poseMode === "free_pose" ? (
              <div className="mt-3 space-y-1">
                <Label
                  htmlFor="pose-prompt-input"
                  className="text-sm font-medium"
                >
                  {styleT("posePromptLabel")}
                </Label>
                <Textarea
                  id="pose-prompt-input"
                  value={posePromptValue}
                  onChange={(e) =>
                    setPosePromptValue(e.target.value.slice(0, POSE_PROMPT_MAX_LENGTH))
                  }
                  placeholder={styleT("posePromptPlaceholder")}
                  rows={2}
                  maxLength={POSE_PROMPT_MAX_LENGTH}
                  disabled={isGenerating || isTutorialInProgress}
                />
                <p className="text-right text-xs text-gray-400">
                  {posePromptValue.length}/{POSE_PROMPT_MAX_LENGTH}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <GenerationModelControls
          value={effectiveSelectedModel}
          onChange={handleSelectedModelChange}
          onLockedClick={() => {
            if (authState === "guest") {
              setShowAuthModal(true);
            } else if (subscriptionPlan === "free") {
              setIsUpsellOpen(true);
            }
          }}
          authState={authState}
          modelLabel={t("modelLabel")}
          disabled={isGenerating || isTutorialInProgress}
          isModelSelectable={
            authState === "authenticated" && subscriptionPlan === "free"
              ? isFreePlanAllowedModel
              : undefined
          }
        />

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
        </div>

        {/* 生成ボタン */}
        <GenerationSubmitButton
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          isGenerating={isGenerating}
          generateLabel={t("generatingButton")}
          generatingLabel={t("generatingButtonLoading")}
          costAmount={showCost ? totalPercoinCost : null}
          dataTour="tour-generate-btn"
          pulseIconWhenGenerating
        />

        {guestGenerationLocked ? (
          <p className="mt-2 text-center text-xs leading-5 text-amber-700">
            {t("guestRateLimitDailyMessage")}
          </p>
        ) : null}

        <SubscriptionUpsellDialog
          open={isUpsellOpen}
          onOpenChange={setIsUpsellOpen}
        />

        <AuthModal
          open={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          redirectTo={currentUrl}
        />

        <ImageSourcePicker
          open={picker.open}
          onOpenChange={picker.setOpen}
          activeTab={picker.activeTab}
          onTabChange={picker.setActiveTab}
          onSelectGenerated={handleSelectGenerated}
          onSelectStock={handleSelectStock}
          selectedStockId={selectedStock?.id ?? null}
          disabled={isGenerating}
          pendingGeneratedId={null}
          currentPreviewUrl={
            selectedStock?.image_url ??
            selectedGenerated?.imageUrl ??
            uploadedImage?.previewUrl ??
            null
          }
          currentPreviewAlt={selectedStock?.name ?? ""}
        />
      </div>
    </Card>
  );
}

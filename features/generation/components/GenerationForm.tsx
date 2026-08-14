"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import {
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
  readPreferredAspectMode,
  writePreferredAspectMode,
} from "../lib/form-preferences";
import { AspectRatioSelector } from "./AspectRatioSelector";
import type { FreeOutputAspectRatioMode } from "@/shared/generation/style-output-aspect-ratio";
import {
  GENERATION_PROMPT_MAX_LENGTH,
  FREE_GENERATION_PROMPT_MAX_LENGTH,
} from "../lib/prompt-validation";
import { DEFAULT_GENERATION_MODEL } from "../types";
import type {
  UploadedImage,
  GeminiModel,
  BackgroundMode,
  SourceImageType,
  PickerSourceItem,
} from "../types";
import {
  COORDINATE_DEFAULT_FRAMING_MODE,
  type FramingMode,
} from "@/shared/generation/framing-mode";
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
import {
  isGenerationSubmitDisabled,
  resolveSubmittedPrompt,
} from "../lib/prompt-locked-submission";

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
    model: GeminiModel;
    /** framing_mode。既定 free_pose / 「維持」チェックON で locked。locked は送らない(省略) */
    framingMode?: FramingMode;
    /** 生成種別。じゆうモードは "free"。省略時は呼び出し側で "coordinate" 扱い。 */
    generationType?: "coordinate" | "free";
    /** じゆうモードの出力比率(source + 明示9比率)。free のときのみ指定。 */
    outputAspectRatioMode?: FreeOutputAspectRatioMode;
    /**
     * 派生生成の原作 root 投稿 ID。promptLocked のときだけ入る。
     * これを送ると API は本文を受け取らず、原作の author secret から解決する。
     */
    sourcePostId?: string;
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
   * 生成モード。
   * - "coordinate"(既定): 従来の詳細設定つきコーディネート生成。
   * - "free": じゆうモード。設定UI(元画像タイプ/背景/ポーズ/モデル)を出さず、
   *   画像+自由記述プロンプトのみ。既定値(model=DEFAULT, backgroundMode=keep)を
   *   固定送信し、generationType="free" で生成する。プロンプト上限は30,000字。
   */
  mode?: "coordinate" | "free";
  /**
   * 派生生成の原作 root 投稿 ID。`promptLocked` と併せて渡す。
   */
  sourcePostId?: string;
  /**
   * プロンプトを閲覧者に入力させないモード（非公開プロンプトの派生生成）。
   *
   * true のとき
   * - プロンプト欄は disabled + グレーアウトにし、本文を一切描画しない
   * - 本文の必須チェックをスキップし、onSubmit の prompt は空文字を渡す
   *   （本文はサーバーが原作の author secret から解決する / REQ-005）
   *
   * `mode="free"` 専用。閲覧者が本文を差し替える余地を作らないため、
   * 値をクライアントへ渡さないだけでなく入力もさせない。
   */
  promptLocked?: boolean;
  /**
   * 施錠した入力欄に表示する本文。公開プロンプトのときだけ入る。
   *
   * 表示専用である。生成に使う本文はサーバーが原作の author secret から
   * 解決するため、ここを書き換えても送信内容は変わらない。
   */
  lockedPromptText?: string | null;
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
  mode = "coordinate",
  promptLocked = false,
  lockedPromptText,
  sourcePostId,
}: GenerationFormProps) {
  const t = useTranslations("coordinate");
  const freeT = useTranslations("free");
  const isFree = mode === "free";
  // じゆうモードは上限30,000字、それ以外は1,500字。
  const promptMaxLength = isFree
    ? FREE_GENERATION_PROMPT_MAX_LENGTH
    : GENERATION_PROMPT_MAX_LENGTH;
  // プロンプト欄のラベル/プレースホルダはモード別。それ以外の機構的な文言は
  // coordinate namespace を流用する(churn を抑える)。
  const postsT = useTranslations("posts");
  const promptLabel = promptLocked
    ? postsT("lockedSheetPromptLabel")
    : isFree
      ? freeT("promptLabel")
      : t("promptLabel");
  // 施錠時のプレースホルダ。公開プロンプトは本文を value に入れるので出ない。
  const promptPlaceholder = promptLocked
    ? postsT("lockedSheetPromptLocked")
    : isFree
      ? freeT("promptPlaceholder")
      : t("promptPlaceholder");
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
  // framing_mode: 既定は free(image_0 の同一性だけ維持し、衣装/ポーズ/カメラ/背景は
  // ユーザー指示に委ねる)。「ポーズ・カメラをできるだけ維持」チェックON で locked に切替。
  // 全ログインユーザー対象。ゲスト同期経路は framingMode 非対応のため認証済みのみ表示。
  const [poseMode, setPoseMode] = useState<FramingMode>(
    COORDINATE_DEFAULT_FRAMING_MODE
  );
  const shouldShowPoseModeControl = authState === "authenticated";
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    DEFAULT_GENERATION_MODEL
  );
  // じゆうモードの出力比率。初期値は source(自動)。マウント後に localStorage から復元する。
  const [aspectMode, setAspectMode] =
    useState<FreeOutputAspectRatioMode>("source");
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
  const isPromptTooLong = promptLength > promptMaxLength;
  const effectiveSelectedModel = resolveEffectiveModelForAuthState(
    selectedModel,
    authState
  );
  const totalPercoinCost = getPercoinCost(effectiveSelectedModel);
  const showCost = authState === "authenticated";

  // ブラウザに保存された前回の選択 (モデル / 背景設定) を復元する。
  // SSR との hydration mismatch を避けるため初期値は default のまま、useEffect で上書きする。
  useEffect(() => {
    setSelectedModel(readPreferredModel());
    setBackgroundMode(readPreferredBackgroundMode());
    // 比率は Free のみ。マウント後に復元(SSR は source、hydration 後に前回値へ)。
    if (isFree) {
      setAspectMode(readPreferredAspectMode());
    }
  }, [isFree]);

  const handleSelectedModelChange = useCallback((value: GeminiModel) => {
    setSelectedModel(value);
    writePreferredModel(value);
  }, []);

  const handleAspectModeChange = useCallback(
    (value: FreeOutputAspectRatioMode) => {
      setAspectMode(value);
      writePreferredAspectMode(value);
    },
    [],
  );

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
    // 施錠時は入力させないので本文は常に空。長さ検証も対象外。
    const trimmedPrompt = resolveSubmittedPrompt(promptLocked, prompt);

    if (!promptLocked) {
      if (!trimmedPrompt) {
        alert(t("missingPrompt"));
        return;
      }

      if (isPromptTooLong) {
        alert(t("promptTooLong", { max: promptMaxLength }));
        return;
      }
    }

    if (!uploadedImage && !selectedStock && !selectedGenerated) {
      alert(t("missingUploadedImage"));
      return;
    }

    // チュートリアル中: コーデスタート押下でStep8へ進む(coordinate 専用配線)。
    // じゆうモードはチュートリアル対象外なので発火しない。
    if (
      !isFree &&
      typeof document !== "undefined" &&
      sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS) === "true"
    ) {
      document.dispatchEvent(
        new CustomEvent("tutorial:advance-to-next", { bubbles: true })
      );
    }

    const commonSourceImage = {
      sourceImage:
        selectedStock || selectedGenerated ? undefined : uploadedImage?.file,
      sourceImageStockId: selectedStock?.id,
      sourceImageGeneratedId: selectedGenerated?.id,
    } as const;

    // じゆうモードはモデル選択(品質・サイズ含む)のみ設定可能。それ以外は既定値を
    // 固定送信する(背景=keep / framingMode なし / sourceImageType=illustration)。
    if (isFree) {
      onSubmit({
        prompt: trimmedPrompt,
        ...commonSourceImage,
        sourceImageType: "illustration",
        backgroundMode: "keep",
        model: effectiveSelectedModel,
        generationType: "free",
        // 出力比率(source は async-api 側で送信を省略=既定挙動)。
        outputAspectRatioMode: aspectMode,
        // 派生生成のときだけ原作を指す。schema は本文との同時指定を 400 にするため、
        // 施錠時に本文を空へ固定していることと対になっている。
        ...(promptLocked && sourcePostId ? { sourcePostId } : {}),
      });
      return;
    }

    // ソース画像の入力は uploadedImage / stock / generated のいずれか 1 つ。
    // selectedStock / selectedGenerated が立っているときはサーバ側で id 経由
    // で URL を解決するため、sourceImage (File) は undefined を渡す。
    onSubmit({
      prompt: trimmedPrompt,
      ...commonSourceImage,
      sourceImageType,
      backgroundMode,
      model: effectiveSelectedModel,
      // framing_mode は UI の選択を常に明示送信する (locked も含む)。
      // 省略に頼らないことで「サーバが省略=locked にフォールバックする」前提と
      // UI 既定 (free) の乖離を構造的に防ぐ (COORDINATE_DEFAULT_FRAMING_MODE 参照)。
      ...(shouldShowPoseModeControl ? { framingMode: poseMode } : {}),
    });
  };

  const hasSourceImage =
    !!uploadedImage || !!selectedStock || !!selectedGenerated;
  const isSubmitDisabled = isGenerationSubmitDisabled({
    promptLocked,
    prompt,
    isPromptTooLong,
    hasSourceImage,
    isGenerating,
    guestGenerationLocked,
  });

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
  // この pending key は /coordinate 専用の持ち越し経路なので、じゆうモードでは消費しない
  // (誤ってじゆうモードのフォームに coordinate 由来の画像を差し込まないため)。
  useEffect(() => {
    if (isFree) return;
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

        {/* 元画像タイプ(実写/イラスト)。じゆうモードでは非表示。 */}
        {!isFree ? (
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
        ) : null}

        {/* じゆうモードの出力比率セレクタ(「生成したい内容」の上に配置)。 */}
        {isFree ? (
          <AspectRatioSelector
            value={aspectMode}
            onChange={handleAspectModeChange}
            disabled={isGenerating || isTutorialInProgress}
          />
        ) : null}

        {/* プロンプト入力(じゆうモードは自由記述 / それ以外は着せ替え内容) */}
        <PromptInputField
          // 施錠時は state を経由させず、渡された表示値だけを出す。
          // 非公開なら本文が来ないので空のままプレースホルダが出る。
          value={promptLocked ? lockedPromptText ?? "" : prompt}
          onChange={promptLocked ? () => {} : setPrompt}
          label={promptLabel}
          placeholder={promptPlaceholder}
          clearLabel={t("promptClear")}
          characterCount={
            promptLocked
              ? ""
              : t("promptCharacterCount", {
                  current: promptLength,
                  max: promptMaxLength,
                })
          }
          maxLength={promptMaxLength}
          invalid={!promptLocked && isPromptTooLong}
          disabled={promptLocked || isGenerating || isTutorialInProgress}
          containerProps={
            isFree ? undefined : { "data-tour": "tour-prompt-input" }
          }
          // じゆうモードはラベルが短い(「生成したい内容」)ためスマホでも 1 行に収める。
          labelRowSingleLine={isFree}
        />

        {/* --- ここから下の設定UIはコーディネート専用。じゆうモードでは全て非表示 --- */}
        {!isFree ? (
          <>
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
          <div>
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
          </div>
        ) : null}
          </>
        ) : null}
        {/* --- 背景/ポーズ/元画像タイプ の coordinate 専用設定ここまで --- */}

        {/* モデル選択(レンダリング品質・出力サイズを含む)は、じゆうモードでも表示する */}
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

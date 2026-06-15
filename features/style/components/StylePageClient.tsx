"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Maximize2, Minimize2, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ImageUploader } from "@/features/generation/components/ImageUploader";
import { ImageSourcePicker } from "@/features/generation/components/ImageSourcePicker/ImageSourcePicker";
import { ImageSourcePickerTrigger } from "@/features/generation/components/ImageSourcePickerTrigger";
import { PromptInputField } from "@/features/generation/components/PromptInputField";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/features/generation/lib/prompt-validation";
import {
  loadUserPromptForCategory,
  saveUserPromptForCategory,
} from "@/features/style/lib/user-prompt-recall";
import { LabelInfoTooltip } from "@/components/LabelInfoTooltip";
import { useImageSourcePicker } from "@/features/generation/hooks/useImageSourcePicker";
import type { SourceImageStock } from "@/features/generation/lib/database";
import type { PickerSourceItem } from "@/features/generation/types";
import { GenerationStatusCard } from "@/features/generation/components/GenerationStatusCard";
import { GenerationResultPanel } from "@/features/generation/components/GenerationResultPanel";
import { useGenerationState } from "@/features/generation/context/GenerationStateContext";
import {
  getGenerationStatus,
  pollGenerationStatus,
  type AsyncGenerationStatus,
} from "@/features/generation/lib/async-api";
import {
  buildCoordinatePreparingCopy,
  buildCoordinateStageCopy,
} from "@/features/generation/lib/coordinate-stage-copy";
import {
  useCoordinateGenerationFeedback,
  type CoordinateGenerationFeedbackPhase,
} from "@/features/generation/hooks/useCoordinateGenerationFeedback";
import {
  normalizeProcessingStage,
  summarizeJobProgress,
} from "@/features/generation/lib/job-progress";
import type { ImageJobProcessingStage } from "@/features/generation/lib/job-types";
import type { UploadedImage } from "@/features/generation/types";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
import { useGenerationFeedback } from "@/features/style/hooks/useGenerationFeedback";
import { recordStyleUsageClientEvent } from "@/features/style/lib/style-usage-client";
import { applyPerstaWatermark } from "@/features/generation/lib/apply-watermark";
import { useWardrobeSave } from "@/features/wardrobe/hooks/use-wardrobe-save";
import { WardrobeSaveButton } from "@/features/wardrobe/components/WardrobeSaveButton";
import { WardrobeClaimOverlay } from "@/features/wardrobe/components/WardrobeClaimOverlay";
import {
  clearGuestGeneration,
  setGuestGeneration,
} from "@/features/wardrobe/lib/guest-generation-store";
import { StyleGenerationStatusCard } from "@/features/style/components/StyleGenerationStatusCard";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import { PostModal } from "@/features/posts/components/PostModal";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import { getPercoinPurchaseUrl } from "@/features/credits/lib/urls";
import {
  getPercoinCost,
  isFreePlanAllowedModel,
  resolveEffectiveModelForAuthState,
} from "@/features/generation/lib/model-config";
import { buildStyleSignupPath } from "@/features/auth/lib/signup-source";
import { ImageDownloadButton } from "@/features/generation/components/ImageDownloadButton";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";
import { GenerationModelControls } from "@/features/generation/components/GenerationModelControls";
import { GenerationSubmitButton } from "@/features/generation/components/GenerationSubmitButton";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { COLLECTION_PROGRESS_REFRESH_EVENT } from "@/features/collections/hooks/useCollectionProgress";
import {
  readPreferredModel,
  writePreferredModel,
} from "@/features/generation/lib/form-preferences";
import {
  DEFAULT_GENERATION_MODEL,
  type GeminiModel,
} from "@/features/generation/types";
import { useCurrentUrlForRedirect } from "@/lib/build-current-url";

interface StylePageClientProps {
  presets: readonly StylePresetPublicSummary[];
  initialAuthState?: "authenticated" | "guest";
  initialSelectedPresetId?: string | null;
  /**
   * 生成直後の結果プレビュー（StyleResultPanel）を表示するかどうか。
   * 未指定 (true) のときは表示。ログインユーザー向けには
   * 生成結果一覧が同じ役割を担うため、ページ側から false を渡して
   * 非表示にする。
   */
  showResultPanel?: boolean;
  /**
   * 認証ユーザーのサブスクリプションプラン。未ログイン時は "free" を渡しても良いが
   * モデル選択ロックには影響しない（ゲストロジック側で処理される）。
   */
  subscriptionPlan?: SubscriptionPlan;
  /**
   * framing_mode (free_pose) のチェックボックスを表示するか。
   * admin viewer 限定の先行公開のため、page 側で isAdminViewer を判定して渡す。
   * UI 非表示はセキュリティではなく、サーバ側 (generate-async) でも検証される。
   */
  canUseFreePose?: boolean;
}

interface StyleErrorState {
  message: string;
  showSignupCta?: boolean;
  signupPath?: string;
}

interface StyleRateLimitStatusState {
  authState: "authenticated" | "guest";
  remainingDaily: number | null;
  showRemainingWarning: boolean;
}

interface StylePercoinBalanceState {
  balance: number | null;
  isLoading: boolean;
  error: string | null;
}

type ResultConfirmationIntent = "change" | "regenerate";
type GenerationPhase = "idle" | "running" | "completing";

const RESULT_REVEAL_DELAY_MS = 5000;
const PREPARING_PROGRESS_PERCENT = 10;
const PREPARING_PROGRESS_TRANSITION_MS = 3000;
// Phase 5 で選択モデル単価に基づく動的コストへ移行 (selectedModelPercoinCost)。
// 旧定数は import 互換のため残しているが、新しい code パスでは参照しない。
const STYLE_PAID_GENERATION_COST = getPercoinCost(STYLE_GENERATION_MODEL);
void STYLE_PAID_GENERATION_COST;
const DEFAULT_POLLING_INTERVAL_MS = 1200;
const FAST_POLLING_INTERVAL_MS = 400;
const SLOW_POLLING_INTERVAL_MS = 1600;
const RESULT_READY_TOAST_DELAY_MS = 2000;
const ASYNC_PROGRESS_TRANSITION_MS: Record<ImageJobProcessingStage, number> = {
  queued: 3000,
  processing: 600,
  charging: 500,
  generating: 25000,
  uploading: 1200,
  persisting: 800,
  completed: 1000,
  failed: 1000,
};

function resolveStyleSignupPath(path?: string) {
  return path ?? buildStyleSignupPath();
}

function getStyleAsyncPollingIntervalMs(status: AsyncGenerationStatus): number {
  if (status.previewImageUrl || status.processingStage === "persisting") {
    return FAST_POLLING_INTERVAL_MS;
  }

  if (
    status.processingStage === "charging" ||
    status.processingStage === "uploading"
  ) {
    return 800;
  }

  if (status.processingStage === "queued") {
    return SLOW_POLLING_INTERVAL_MS;
  }

  return DEFAULT_POLLING_INTERVAL_MS;
}

function resolveInitialSelectedPresetId(
  presets: readonly StylePresetPublicSummary[],
  initialSelectedPresetId?: string | null
): StylePresetPublicSummary["id"] {
  if (
    initialSelectedPresetId &&
    presets.some((preset) => preset.id === initialSelectedPresetId)
  ) {
    return initialSelectedPresetId;
  }

  return presets[0]?.id ?? "";
}

function StyleReferencePanel({
  label,
  imageSrc,
  imageAlt,
  className,
  collapsed = false,
  aspectRatio,
  tooltip,
}: {
  label: string;
  imageSrc: string;
  imageAlt: string;
  className?: string;
  collapsed?: boolean;
  aspectRatio?: number;
  /**
   * 画像コンテナの右上に絶対配置で重ねる任意の要素 (主に LabelInfoTooltip の `?` を想定)。
   * preset カテゴリの user_guidance を画像内に表示するために使う。
   */
  tooltip?: React.ReactNode;
}) {
  return (
    <div className={className ?? "space-y-3"}>
      <Label
        className={
          collapsed
            ? "text-xs font-medium leading-none"
            : "text-base font-medium"
        }
      >
        {label}
      </Label>
      <Card className="overflow-hidden p-0">
        <div
          className="relative bg-slate-100"
          style={{ aspectRatio: String(aspectRatio ?? 1) }}
        >
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
          {tooltip ? (
            <div
              className={`absolute z-10 ${collapsed ? "right-1 top-1" : "right-2 top-2"}`}
            >
              {tooltip}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

// 旧 StyleResultPanel は features/generation/components/GenerationResultPanel.tsx
// に抽出した。

async function fetchStyleRateLimitStatus(): Promise<StyleRateLimitStatusState | null> {
  const response = await fetch("/style/rate-limit-status", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        authState?: unknown;
        remainingDaily?: unknown;
        showRemainingWarning?: unknown;
      }
    | null;

  if (
    !payload ||
    (payload.authState !== "authenticated" && payload.authState !== "guest")
  ) {
    return null;
  }

  return {
    authState: payload.authState,
    remainingDaily:
      typeof payload.remainingDaily === "number" ? payload.remainingDaily : null,
    showRemainingWarning: payload.showRemainingWarning === true,
  };
}

function StyleResultDownloadButton({
  imageUrl,
  styleId,
  label,
  ariaLabel,
  successTitle,
  successDescription,
  failedMessage,
  transformBlob,
}: {
  imageUrl: string;
  styleId: string;
  label: string;
  ariaLabel: string;
  successTitle: string;
  successDescription: string;
  failedMessage: string;
  transformBlob?: (blob: Blob) => Promise<Blob>;
}) {
  const trackDownloadUsage = () => {
    void recordStyleUsageClientEvent({
      eventType: "download",
      styleId,
    }).catch(() => {
      // Usage tracking must not block the successful download/share flow.
    });
  };

  return (
    <ImageDownloadButton
      imageUrl={imageUrl}
      id={styleId}
      variant="outline"
      label={label}
      ariaLabel={ariaLabel}
      messages={{
        accessDenied: failedMessage,
        fetchFailed: () => failedMessage,
        // errorTitle を渡さないことで、失敗時のトーストは title=詳細メッセージ
        // のみ（既存挙動と同じ）になる。
        failedFallback: failedMessage,
        successTitle,
        successDescription,
      }}
      callbacks={{
        onShareSuccess: trackDownloadUsage,
        onDownloadSuccess: trackDownloadUsage,
      }}
      transformBlob={transformBlob}
    />
  );
}

export function StylePageClient({
  presets,
  initialAuthState,
  initialSelectedPresetId,
  showResultPanel = true,
  subscriptionPlan = "free",
  canUseFreePose = false,
}: StylePageClientProps) {
  const router = useRouter();
  const t = useTranslations("style");
  const coordinateT = useTranslations("coordinate");
  const postsT = useTranslations("posts");
  const locale = useLocale();
  const styleCardLocale = locale === "en" ? "en" : "ja";
  const { toast, dismiss } = useToast();
  const presetStripRef = useRef<HTMLDivElement | null>(null);
  const generationStatusSectionRef = useRef<HTMLDivElement | null>(null);
  const resultSectionRef = useRef<HTMLDivElement | null>(null);
  const presetButtonRefs = useRef(
    new Map<StylePresetPublicSummary["id"], HTMLButtonElement>()
  );
  const [selectedPresetId, setSelectedPresetId] = useState<
    StylePresetPublicSummary["id"]
  >(() => resolveInitialSelectedPresetId(presets, initialSelectedPresetId));
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  /**
   * ピッカーから「生成済み / ストック」を選んだとき、URL → File → 再アップ
   * ロードのラウンドトリップを省略する。代わりに id と preview URL だけを
   * 保持し、submit 時に sourceImageStockId / sourceImageGeneratedId として
   * サーバへ送る。uploadedImage とは排他。
   */
  const [selectedRemoteSource, setSelectedRemoteSource] = useState<
    | { kind: "stock"; id: string; previewUrl: string; name?: string | null }
    | { kind: "generated"; id: string; previewUrl: string }
    | null
  >(null);
  const picker = useImageSourcePicker({ defaultTab: "generated" });

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
  const [sourceImageType, setSourceImageType] = useState<SourceImageType>("illustration");
  const [backgroundChange, setBackgroundChange] = useState(false);
  // ポーズ・アングル入力欄 (admin viewer 限定先行公開)。
  // チェック ON で入力欄を表示し、非空のままで生成するとサーバ側が free_pose を含意する。
  // 最大文字数はサーバ側 STYLE_POSE_PROMPT_MAX_LENGTH と揃える。
  const POSE_PROMPT_MAX_LENGTH = 500;
  const [posePromptEnabled, setPosePromptEnabled] = useState(false);
  const [posePromptValue, setPosePromptValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    DEFAULT_GENERATION_MODEL
  );
  // dual + user_upload preset 用の image_1。preset.dualReferenceSource='user_upload' のときのみ意味あり。
  const [userReferenceImage, setUserReferenceImage] = useState<File | null>(
    null,
  );
  // category.showUserPromptInput=true のときのみ意味あり (= サーバ側でホワイトリスト処理)。
  const [userPromptInputValue, setUserPromptInputValue] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isUpsellOpen, setIsUpsellOpen] = useState(false);
  const currentUrl = useCurrentUrlForRedirect();
  // /style ページが GenerationStateProvider でラップされているとき、
  // 生成結果一覧が isGenerating / generatingCount を購読してスケルトン表示する。
  // ラップされていない（ゲストモード等）場合は null。
  const generationStateContext = useGenerationState();
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle");
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [queuedResultImageUrl, setQueuedResultImageUrl] = useState<string | null>(null);
  const [resultGeneratedImageId, setResultGeneratedImageId] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<StyleErrorState | null>(null);
  const [rateLimitStatus, setRateLimitStatus] =
    useState<StyleRateLimitStatusState | null>(null);
  const [percoinBalanceState, setPercoinBalanceState] =
    useState<StylePercoinBalanceState>({
      balance: null,
      isLoading: false,
      error: null,
    });
  const [activeAsyncJobStatus, setActiveAsyncJobStatus] =
    useState<AsyncGenerationStatus | null>(null);
  const [rateLimitDialogMessage, setRateLimitDialogMessage] = useState<string | null>(null);
  const [isReferenceCardCollapsed, setIsReferenceCardCollapsed] = useState(false);
  const [isResultResetDialogOpen, setIsResultResetDialogOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isPresetStripDragging, setIsPresetStripDragging] = useState(false);
  const [resultConfirmationIntent, setResultConfirmationIntent] =
    useState<ResultConfirmationIntent>("change");
  const pendingResultResetActionRef = useRef<null | (() => void)>(null);
  const activePollStopRef = useRef<(() => void) | null>(null);
  const hasTrackedVisitRef = useRef(false);
  const syncedSelectedPresetParamRef = useRef<string | null>(
    initialSelectedPresetId ?? null
  );
  const presetDragStartXRef = useRef(0);
  const presetDragStartScrollLeftRef = useRef(0);
  const suppressPresetClickRef = useRef(false);
  const pendingResultImageRecenterRef = useRef(false);
  const pendingResultImageRecenterTimeoutRef = useRef<number | null>(null);
  const resultReadyToastTimeoutRef = useRef<number | null>(null);
  const resultReadyToastIdRef = useRef<string | null>(null);
  const resultImageLoadedRef = useRef(false);

  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? presets[0] ?? null;

  // プリセット切り替え時に preset 固有の入力 (userPrompt / 参考画像) をリセットする。
  // 別 preset で意図しない入力が引き継がれてクレジット浪費しないための防御。
  // userPrompt は category 単位で localStorage に「前回の入力」を保存しており、
  // 復元することで「ユーザーがまた来た時にも同じ追記を再利用できる」UX を提供する。
  useEffect(() => {
    setUserReferenceImage(null);
    if (!selectedPreset?.category.showUserPromptInput) {
      setUserPromptInputValue("");
      return;
    }
    setUserPromptInputValue(
      loadUserPromptForCategory(
        selectedPreset.category.key,
        selectedPreset.category.userPromptMaxLength ??
          GENERATION_PROMPT_MAX_LENGTH,
      ),
    );
  }, [
    selectedPreset?.id,
    selectedPreset?.category.key,
    selectedPreset?.category.showUserPromptInput,
    selectedPreset?.category.userPromptMaxLength,
  ]);

  const shouldShowSourceImageTypeControl =
    selectedPreset?.category.showSourceImageTypeControl ?? true;
  const shouldShowBackgroundChangeControl =
    selectedPreset?.category.showBackgroundChangeControl ?? true;
  const shouldShowGenerationModelControl =
    selectedPreset?.category.showGenerationModelControl ?? true;
  const effectiveSourceImageType = shouldShowSourceImageTypeControl
    ? sourceImageType
    : "illustration";
  const effectiveBackgroundChange = shouldShowBackgroundChangeControl
    ? backgroundChange
    : false;
  const effectiveAuthState = rateLimitStatus?.authState ?? initialAuthState ?? null;
  const wardrobeSave = useWardrobeSave({ authState: effectiveAuthState });
  const modelAuthState =
    effectiveAuthState === "authenticated" ? "authenticated" : "guest";
  const effectiveSelectedModel = resolveEffectiveModelForAuthState(
    shouldShowGenerationModelControl ? selectedModel : DEFAULT_GENERATION_MODEL,
    modelAuthState
  );
  const shouldUseAsyncGeneration = effectiveAuthState === "authenticated";
  const isGuestDailyLimitReached =
    rateLimitStatus?.remainingDaily === 0 && rateLimitStatus.authState === "guest";
  const isAuthenticatedPaidOnlyMode =
    rateLimitStatus?.remainingDaily === 0 &&
    rateLimitStatus.authState === "authenticated";
  // 選択中モデル単価でペルコイン残高をチェックする (Phase 5 / UCL-007)
  const selectedModelPercoinCost = getPercoinCost(effectiveSelectedModel);
  const hasEnoughPercoins =
    typeof percoinBalanceState.balance === "number" &&
    percoinBalanceState.balance >= selectedModelPercoinCost;
  const shouldDisablePaidContinuation =
    isAuthenticatedPaidOnlyMode &&
    (percoinBalanceState.isLoading ||
      Boolean(percoinBalanceState.error) ||
      !hasEnoughPercoins);

  const isGenerating = generationPhase !== "idle";
  // ゲストが1枚生成した後の状態。1日1回のため再生成できず、結果を消す操作をすると
  // 「画像ゼロ・保存対象ゼロ」のデッドエンドになる。よって設定変更・再生成を一括で抑止し、
  // 結果を保持したまま保存(ログイン)/DL に集中させる。認証ユーザーは結果がアカウントに
  // 保存され再生成も可能なため対象外。
  const isGuestResultLocked =
    effectiveAuthState !== "authenticated" && Boolean(resultImageUrl);
  const isBackgroundChangeAvailable =
    shouldShowBackgroundChangeControl && Boolean(selectedPreset?.hasBackgroundPrompt);
  const isBackgroundChangeDisabled =
    isGenerating || isGuestResultLocked || !isBackgroundChangeAvailable;
  // ポーズ・アングル入力欄の表示条件:
  //  - admin viewer (canUseFreePose) かつ認証済み (ゲスト同期経路は posePrompt を解釈しない)
  //  - raw モードカテゴリ (skipBasePrefix) ではサーバ側で無視されるため表示しない
  const shouldShowPosePromptControl =
    canUseFreePose &&
    shouldUseAsyncGeneration &&
    !(selectedPreset?.category.skipBasePrefix ?? false);
  const effectivePosePrompt =
    shouldShowPosePromptControl && posePromptEnabled
      ? posePromptValue.trim()
      : "";
  const hasSourceImage = Boolean(uploadedImage) || Boolean(selectedRemoteSource);
  // ゲストの無料生成（1日1回）は category.key が "coordinate" のプリセットのみ許可。
  // それ以外のカテゴリは生成させず「ログインで生成可能！」CTA を出す（サーバ側でも検証）。
  const isGuestRestrictedCategory =
    effectiveAuthState !== "authenticated" &&
    selectedPreset != null &&
    selectedPreset.category.key !== "coordinate";
  const isGenerateDisabled =
    !selectedPreset ||
    !hasSourceImage ||
    isGenerating ||
    isGuestDailyLimitReached ||
    shouldDisablePaidContinuation ||
    isGuestResultLocked ||
    isGuestRestrictedCategory;
  const hasGeneratedResult = Boolean(resultImageUrl);
  const activeAsyncResultImageUrl =
    shouldUseAsyncGeneration && isGenerating
      ? activeAsyncJobStatus?.resultImageUrl ?? null
      : null;
  const resultPreviewImageUrl =
    shouldUseAsyncGeneration && isGenerating
      ? activeAsyncJobStatus?.previewImageUrl ?? null
      : null;
  const displayedResultImageUrl =
    resultImageUrl ??
    queuedResultImageUrl ??
    activeAsyncResultImageUrl ??
    resultPreviewImageUrl;
  const canPostGeneratedResult =
    Boolean(resultImageUrl) &&
    Boolean(resultGeneratedImageId) &&
    effectiveAuthState === "authenticated";

  // ゲストが生成した画像を共有ストアへ publish（バナー/サイドバーの保存導線用）。
  const guestSaveImage = resultImageUrl ?? displayedResultImageUrl;
  useEffect(() => {
    if (effectiveAuthState !== "authenticated" && guestSaveImage) {
      setGuestGeneration({
        imageBase64: guestSaveImage,
        styleId: selectedPreset?.id ?? null,
      });
    } else {
      clearGuestGeneration();
    }
    return () => clearGuestGeneration();
  }, [effectiveAuthState, guestSaveImage, selectedPreset?.id]);

  const isCompletingGeneration = generationPhase === "completing";
  // ユーザープロンプト入力の最大文字数(カテゴリ別設定を優先、未設定は既定値)
  const userPromptMaxLength =
    selectedPreset?.category.userPromptMaxLength ??
    GENERATION_PROMPT_MAX_LENGTH;
  const selectedPresetAspectRatio = selectedPreset
    ? selectedPreset.thumbnailWidth / selectedPreset.thumbnailHeight
    : 1;
  const [resultShellAspectRatio, setResultShellAspectRatio] = useState(
    selectedPresetAspectRatio
  );
  const remainingDailyNoticeCount =
    rateLimitStatus?.showRemainingWarning &&
    typeof rateLimitStatus.remainingDaily === "number" &&
    rateLimitStatus.remainingDaily > 0
      ? rateLimitStatus.remainingDaily
      : null;
  const shouldShowDailyLimitCard =
    isGuestDailyLimitReached || isAuthenticatedPaidOnlyMode;
  const generationMessages = useMemo(
    () => [
      t("generationStatusMessage1"),
      t("generationStatusMessage2"),
      t("generationStatusMessage3"),
      t("generationStatusMessage4"),
      t("generationStatusMessage5"),
      t("generationStatusMessage6"),
      t("generationStatusMessage7"),
      t("generationStatusMessage8"),
      t("generationStatusMessage9"),
      t("generationStatusMessage10"),
      t("generationStatusMessage11"),
      t("generationStatusMessage12"),
    ],
    [t]
  );
  const guestGenerationFeedback = useGenerationFeedback(
    generationPhase,
    generationMessages,
    t("generationStatusCompleteMessage")
  );
  const asyncStageCopy = useMemo(
    () => buildCoordinateStageCopy(coordinateT),
    [coordinateT]
  );
  const asyncPreparingCopy = useMemo(
    () => buildCoordinatePreparingCopy(coordinateT),
    [coordinateT]
  );
  const asyncProgressSummary = activeAsyncJobStatus
    ? summarizeJobProgress([
        {
          status: activeAsyncJobStatus.status,
          processingStage: normalizeProcessingStage(
            activeAsyncJobStatus.status,
            activeAsyncJobStatus.processingStage
          ),
        },
      ])
    : {
        totalCount: 1,
        completedCount: 0,
        pendingCount: 1,
        representativeStage: "queued" as const,
        progressPercent: 15,
      };
  const isAsyncStatusCard = shouldUseAsyncGeneration && isGenerating;
  const asyncFeedbackPhase = generationPhase as CoordinateGenerationFeedbackPhase;
  const isPreparingAsyncSubmission =
    asyncFeedbackPhase === "running" && !activeAsyncJobStatus;
  const asyncStatusCardStage =
    asyncFeedbackPhase === "completing"
      ? "completed"
      : asyncProgressSummary.representativeStage;
  const {
    activeMessage: asyncStatusCardLiveMessage,
    displayedMessage: asyncStatusCardMessage,
    activeHint: asyncStatusCardHint,
    prefersReducedMotion: asyncStatusCardPrefersReducedMotion,
  } = useCoordinateGenerationFeedback(
    isAsyncStatusCard ? asyncFeedbackPhase : "idle",
    isPreparingAsyncSubmission
      ? asyncPreparingCopy
      : asyncStageCopy[asyncStatusCardStage]
  );
  const asyncStatusCardProgress = isCompletingGeneration
    ? 100
    : isPreparingAsyncSubmission
      ? PREPARING_PROGRESS_PERCENT
      : asyncProgressSummary.progressPercent;
  const asyncStatusCardProgressTransitionDurationMs =
    isPreparingAsyncSubmission
      ? PREPARING_PROGRESS_TRANSITION_MS
      : ASYNC_PROGRESS_TRANSITION_MS[asyncStatusCardStage];
  const guestStatusCardMessage = guestGenerationFeedback.displayedMessage;
  const guestStatusCardLiveMessage = guestGenerationFeedback.activeMessage;
  const guestStatusCardProgress = guestGenerationFeedback.progress;
  const guestStatusCardIsLongWait = guestGenerationFeedback.isLongWait;
  const guestStatusCardPrefersReducedMotion =
    guestGenerationFeedback.prefersReducedMotion;

  const scrollSectionIntoView = (section: HTMLDivElement | null) => {
    if (typeof section?.scrollIntoView !== "function") {
      return;
    }

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    section.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  };

  const handleSignupCtaClick = (signupPath?: string) => {
    void recordStyleUsageClientEvent({
      eventType: "signup_click",
      styleId: selectedPreset?.id ?? null,
    }).catch(() => {
      // Signup CTA tracking must not block navigation.
    });

    router.push(resolveStyleSignupPath(signupPath));
  };

  const handleWardrobeSaveClick = () => {
    wardrobeSave.requestSave({
      imageBase64: resultImageUrl ?? displayedResultImageUrl,
      styleId: selectedPreset?.id ?? null,
    });
  };

  const clearResultReadyToastTimeout = () => {
    if (resultReadyToastTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(resultReadyToastTimeoutRef.current);
    resultReadyToastTimeoutRef.current = null;
  };

  const dismissResultReadyToast = () => {
    clearResultReadyToastTimeout();

    if (resultReadyToastIdRef.current) {
      dismiss(resultReadyToastIdRef.current);
      resultReadyToastIdRef.current = null;
    }
  };

  const clearPendingResultImageRecenterTimeout = () => {
    if (pendingResultImageRecenterTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingResultImageRecenterTimeoutRef.current);
    pendingResultImageRecenterTimeoutRef.current = null;
  };

  const handleResultImageLoad = (imageAspectRatio: number | null) => {
    resultImageLoadedRef.current = true;

    if (
      typeof imageAspectRatio === "number" &&
      Number.isFinite(imageAspectRatio) &&
      imageAspectRatio > 0
    ) {
      setResultShellAspectRatio(imageAspectRatio);
    }

    if (!pendingResultImageRecenterRef.current) {
      return;
    }

    clearPendingResultImageRecenterTimeout();
    pendingResultImageRecenterTimeoutRef.current = window.setTimeout(() => {
      scrollSectionIntoView(resultSectionRef.current);
      pendingResultImageRecenterRef.current = false;
      pendingResultImageRecenterTimeoutRef.current = null;
    }, 0);
  };

  // localStorage に保存された前回選択モデルを復元 (Phase 5 / UCL-013)
  useEffect(() => {
    setSelectedModel(readPreferredModel());
  }, []);

  // ユーザー操作経由のモデル変更だけ localStorage に書く
  const handleSelectedModelChange = useCallback((next: GeminiModel) => {
    setSelectedModel(next);
    writePreferredModel(next);
  }, []);

  // 生成結果一覧（GenerationStateProvider 配下）が skeleton を表示できるよう、
  // ローカルの generationPhase を context にも反映する。
  // 注意: 依存に generationStateContext 全体を入れると、setIsGenerating 呼出で
  //       context value（useMemo の戻り値）が再生成 → effect 再実行 → 無限ループ
  //       になる。useState setter / useCallback 関数は stable なので、それらを
  //       destructure して依存に並べる。
  const ctxSetIsGenerating = generationStateContext?.setIsGenerating;
  const ctxSetGeneratingCount = generationStateContext?.setGeneratingCount;
  const ctxSetTotalCount = generationStateContext?.setTotalCount;
  const ctxClearPreviewImages = generationStateContext?.clearPreviewImages;
  useEffect(() => {
    if (
      !ctxSetIsGenerating ||
      !ctxSetGeneratingCount ||
      !ctxSetTotalCount ||
      !ctxClearPreviewImages
    ) {
      return;
    }
    const isActive =
      generationPhase === "running" || generationPhase === "completing";
    ctxSetIsGenerating(isActive);
    ctxSetGeneratingCount(isActive ? 1 : 0);
    ctxSetTotalCount(isActive ? 1 : 0);
    if (!isActive) {
      ctxClearPreviewImages();
    }
  }, [
    generationPhase,
    ctxSetIsGenerating,
    ctxSetGeneratingCount,
    ctxSetTotalCount,
    ctxClearPreviewImages,
  ]);

  useEffect(() => {
    if (generationPhase !== "completing" || !queuedResultImageUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResultImageUrl(queuedResultImageUrl);
      setQueuedResultImageUrl(null);
      setGenerationPhase("idle");
    }, RESULT_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [generationPhase, queuedResultImageUrl]);

  useEffect(() => {
    if (generationPhase !== "running") {
      return;
    }

    scrollSectionIntoView(generationStatusSectionRef.current);
  }, [generationPhase]);

  useEffect(() => {
    if (generationPhase !== "completing") {
      return;
    }

    clearResultReadyToastTimeout();
    resultReadyToastTimeoutRef.current = window.setTimeout(() => {
      dismissResultReadyToast();
      const { id } = toast({
        title: t("resultReadyToastTitle"),
        className: "cursor-pointer",
        duration: 5000,
        onClick: () => {
          pendingResultImageRecenterRef.current =
            !resultImageLoadedRef.current;
          scrollSectionIntoView(resultSectionRef.current);
          dismissResultReadyToast();
        },
      });
      resultReadyToastIdRef.current = id;
      resultReadyToastTimeoutRef.current = null;
    }, RESULT_READY_TOAST_DELAY_MS);

    return () => {
      clearResultReadyToastTimeout();
    };
  }, [dismiss, generationPhase, t, toast]);

  useEffect(() => {
    return () => {
      dismissResultReadyToast();
      clearPendingResultImageRecenterTimeout();
      activePollStopRef.current?.();
      activePollStopRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (displayedResultImageUrl) {
      return;
    }

    resultImageLoadedRef.current = false;
    setResultShellAspectRatio(selectedPresetAspectRatio);
  }, [displayedResultImageUrl, selectedPresetAspectRatio]);

  useEffect(() => {
    let isActive = true;

    void fetchStyleRateLimitStatus()
      .then((status) => {
        if (isActive && status) {
          setRateLimitStatus(status);
        }
      })
      .catch(() => {
        // Status fetch failures should not affect the page UX.
      });

    return () => {
      isActive = false;
    };
  }, []);

  const refreshPercoinBalance = async () => {
    if (effectiveAuthState !== "authenticated") {
      setPercoinBalanceState({
        balance: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    setPercoinBalanceState((previous) => ({
      balance: previous.balance,
      isLoading: true,
      error: null,
    }));

    try {
      const payload = await fetchPercoinBalance({
        fetchBalanceFailed: t("percoinBalanceFetchFailed"),
      });
      setPercoinBalanceState({
        balance: payload.balance,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setPercoinBalanceState({
        balance: null,
        isLoading: false,
        error: error instanceof Error ? error.message : t("percoinBalanceFetchFailed"),
      });
    }
  };

  useEffect(() => {
    if (effectiveAuthState !== "authenticated") {
      setPercoinBalanceState({
        balance: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    void refreshPercoinBalance();
  }, [effectiveAuthState, isAuthenticatedPaidOnlyMode]);

  useEffect(() => {
    if (
      (!selectedPreset?.hasBackgroundPrompt || !shouldShowBackgroundChangeControl) &&
      backgroundChange
    ) {
      setBackgroundChange(false);
    }
  }, [
    backgroundChange,
    selectedPreset?.hasBackgroundPrompt,
    shouldShowBackgroundChangeControl,
  ]);

  useEffect(() => {
    if (!selectedPresetId) {
      return;
    }

    const strip = presetStripRef.current;
    const selectedButton = presetButtonRefs.current.get(selectedPresetId);
    if (!strip || !selectedButton) {
      return;
    }

    // 横スクロールのストリップ内でのみ選択プリセットを中央寄せする。
    // scrollIntoView は縦方向のページスクロールも巻き込み、読み込み直後に
    // ページが少し下がって見える原因になるため、strip.scrollLeft を直接
    // 操作して横スクロールに限定する。初期表示の presets[0] は左端のため
    // targetLeft が負になり Math.max(0, ...) で 0 にクランプされ、スクロール
    // は発生しない。
    const stripRect = strip.getBoundingClientRect();
    const buttonRect = selectedButton.getBoundingClientRect();
    const targetLeft = Math.max(
      0,
      strip.scrollLeft +
        (buttonRect.left - stripRect.left) -
        (strip.clientWidth - selectedButton.clientWidth) / 2
    );

    // scrollTo 未実装の環境(jsdom 等)では scrollLeft 代入にフォールバックする。
    if (typeof strip.scrollTo === "function") {
      strip.scrollTo({ left: targetLeft, behavior: "smooth" });
    } else {
      strip.scrollLeft = targetLeft;
    }
  }, [selectedPresetId]);

  useEffect(() => {
    const hasValidPresetParam =
      typeof initialSelectedPresetId === "string" &&
      presets.some((preset) => preset.id === initialSelectedPresetId);

    if (
      hasValidPresetParam &&
      syncedSelectedPresetParamRef.current !== initialSelectedPresetId
    ) {
      syncedSelectedPresetParamRef.current = initialSelectedPresetId;
      setSelectedPresetId(initialSelectedPresetId);
      return;
    }

    if (presets.some((preset) => preset.id === selectedPresetId)) {
      return;
    }

    syncedSelectedPresetParamRef.current = initialSelectedPresetId ?? null;
    setSelectedPresetId(
      resolveInitialSelectedPresetId(presets, initialSelectedPresetId)
    );
  }, [initialSelectedPresetId, presets, selectedPresetId]);

  const refreshRateLimitStatus = () => {
    void fetchStyleRateLimitStatus()
      .then((status) => {
        if (status) {
          setRateLimitStatus(status);
        }
      })
      .catch(() => {
        // Status fetch failures should not affect the page UX.
      });
  };

  const runAfterResultResetCheck = (
    action: () => void,
    intent: ResultConfirmationIntent = "change"
  ) => {
    // ゲスト生成後は結果を消す操作を一切行わない(UI 無効化の最終防壁)。
    // 再生成できないため、結果を消しても利点がなくデッドエンドになるだけ。
    if (isGuestResultLocked) {
      return;
    }

    if (!hasGeneratedResult) {
      action();
      return;
    }

    pendingResultResetActionRef.current = action;
    setResultConfirmationIntent(intent);
    setIsResultResetDialogOpen(true);
  };

  const handleResultResetDialogChange = (open: boolean) => {
    setIsResultResetDialogOpen(open);
    if (!open) {
      pendingResultResetActionRef.current = null;
    }
  };

  const handleConfirmResultReset = () => {
    const pendingAction = pendingResultResetActionRef.current;
    pendingResultResetActionRef.current = null;
    setIsResultResetDialogOpen(false);
    pendingAction?.();
  };

  const handlePresetSelect = (presetId: StylePresetPublicSummary["id"]) => {
    if (presetId === selectedPresetId) {
      return;
    }

    runAfterResultResetCheck(() => {
      setSelectedPresetId(presetId);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const endPresetStripDrag = () => {
    presetDragStartXRef.current = 0;
    presetDragStartScrollLeftRef.current = 0;
    setIsPresetStripDragging(false);
  };

  useEffect(() => {
    if (!isPresetStripDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const strip = presetStripRef.current;
      if (!strip) {
        return;
      }

      const deltaX = event.clientX - presetDragStartXRef.current;
      if (Math.abs(deltaX) > 6) {
        suppressPresetClickRef.current = true;
      }

      strip.scrollLeft = presetDragStartScrollLeftRef.current - deltaX;
    };

    const handleMouseUp = () => {
      endPresetStripDrag();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPresetStripDragging]);

  const handlePresetStripMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    presetDragStartXRef.current = event.clientX;
    presetDragStartScrollLeftRef.current =
      presetStripRef.current?.scrollLeft ?? 0;
    suppressPresetClickRef.current = false;
    setIsPresetStripDragging(true);
    event.preventDefault();
  };

  const handlePresetStripClickCapture = (
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (!suppressPresetClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressPresetClickRef.current = false;
  };

  const buildPresetButtonRef =
    (presetId: StylePresetPublicSummary["id"]) =>
    (node: HTMLButtonElement | null) => {
      if (node) {
        presetButtonRefs.current.set(presetId, node);
        return;
      }

      presetButtonRefs.current.delete(presetId);
    };

  const handleUpload = (image: UploadedImage) => {
    runAfterResultResetCheck(() => {
      setUploadedImage(image);
      // 直接アップロードを優先するため、リモート選択はクリア。
      setSelectedRemoteSource(null);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const handleUploadRemove = () => {
    runAfterResultResetCheck(() => {
      setUploadedImage(null);
      setSelectedRemoteSource(null);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  /**
   * 「生成済み」または「ストック」画像をピッカーから選んだ際の共通処理。
   * 旧実装は URL → File → /api/source-image-stocks に再アップロード → 完了
   * 待ちというラウンドトリップだったが、サーバ側で sourceImageStockId /
   * sourceImageGeneratedId を直接受け取れるよう拡張したため (Phase 1/2)、
   * クライアントは id と preview URL のみ保持して即座に picker を閉じる。
   */
  const handleSelectGenerated = (
    item: Extract<PickerSourceItem, { kind: "generated" }>
  ) => {
    runAfterResultResetCheck(() => {
      setUploadedImage(null);
      setSelectedRemoteSource({
        kind: "generated",
        id: item.id,
        previewUrl: item.imageUrl,
      });
      setErrorState(null);
      setResultImageUrl(null);
    });
    picker.closePicker();
  };

  const handleSelectStock = (stock: SourceImageStock) => {
    runAfterResultResetCheck(() => {
      setUploadedImage(null);
      setSelectedRemoteSource({
        kind: "stock",
        id: stock.id,
        previewUrl: stock.image_url,
        name: stock.name,
      });
      setErrorState(null);
      setResultImageUrl(null);
    });
    picker.closePicker();
  };

  const handleSourceImageTypeChange = (value: SourceImageType) => {
    if (value === sourceImageType) {
      return;
    }

    runAfterResultResetCheck(() => {
      setSourceImageType(value);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const handleBackgroundChangeToggle = (checked: boolean) => {
    if (checked === backgroundChange || isBackgroundChangeDisabled) {
      return;
    }

    runAfterResultResetCheck(() => {
      setBackgroundChange(checked);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const stopActivePolling = () => {
    activePollStopRef.current?.();
    activePollStopRef.current = null;
  };

  const handleGenerationError = (message: string) => {
    stopActivePolling();
    dismissResultReadyToast();
    clearPendingResultImageRecenterTimeout();
    pendingResultImageRecenterRef.current = false;
    setActiveAsyncJobStatus(null);
    setQueuedResultImageUrl(null);
    setResultGeneratedImageId(null);
    setErrorState({ message });
    setGenerationPhase("idle");
  };

  const generateImageWithSynchronousPreview = async () => {
    if (!selectedPreset || !uploadedImage || isGenerating) {
      return;
    }

    stopActivePolling();
    dismissResultReadyToast();
    clearPendingResultImageRecenterTimeout();
    pendingResultImageRecenterRef.current = false;
    setActiveAsyncJobStatus(null);
    setQueuedResultImageUrl(null);
    setResultGeneratedImageId(null);
    setResultImageUrl(null);
    setGenerationPhase("running");
    setErrorState(null);

    try {
      const normalizedFile = await normalizeSourceImage(uploadedImage.file);

      const formData = new FormData();
      formData.set("styleId", selectedPreset.id);
      formData.set("uploadImage", normalizedFile);
      formData.set("sourceImageType", effectiveSourceImageType);
      formData.set("backgroundChange", effectiveBackgroundChange ? "true" : "false");
      formData.set("model", effectiveSelectedModel);
      if (
        selectedPreset.imageInputMode === "dual" &&
        selectedPreset.dualReferenceSource === "user_upload" &&
        userReferenceImage
      ) {
        formData.set("uploadImage2", userReferenceImage);
      }
      if (
        selectedPreset.category.showUserPromptInput &&
        userPromptInputValue.trim().length > 0
      ) {
        formData.set("userPrompt", userPromptInputValue);
      }
      // category 単位で「最後に submit したプロンプト」を localStorage に記憶し、
      // 次回 /style 来訪時に prefill する。空(=クリア後)送信は記憶を消去する。
      if (selectedPreset.category.showUserPromptInput) {
        saveUserPromptForCategory(
          selectedPreset.category.key,
          userPromptInputValue,
        );
      }

      const response = await fetch("/style/generate", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            imageDataUrl?: string;
            mimeType?: string;
            signupCta?: boolean;
            signupPath?: string;
            showRateLimitDialog?: boolean;
          }
        | null;

      if (!response.ok) {
        if (payload?.showRateLimitDialog === true) {
          setRateLimitDialogMessage(payload?.error || t("guestRateLimitShort"));
          setGenerationPhase("idle");
          refreshRateLimitStatus();
          void refreshPercoinBalance();
          return;
        }

        setErrorState({
          message: payload?.error || t("generationFailed"),
          showSignupCta: payload?.signupCta === true,
          signupPath:
            typeof payload?.signupPath === "string" ? payload.signupPath : undefined,
        });
        setGenerationPhase("idle");
        refreshRateLimitStatus();
        void refreshPercoinBalance();
        return;
      }

      if (!payload?.imageDataUrl || typeof payload.imageDataUrl !== "string") {
        throw new Error(t("unknownError"));
      }

      setResultImageUrl(payload.imageDataUrl);
      setQueuedResultImageUrl(payload.imageDataUrl);
      setGenerationPhase("completing");
      refreshRateLimitStatus();
    } catch (error) {
      setQueuedResultImageUrl(null);
      setErrorState({
        message: error instanceof Error ? error.message : t("unknownError"),
      });
      setGenerationPhase("idle");
    }
  };

  const generateImageWithAsyncJob = async () => {
    if (
      !selectedPreset ||
      (!uploadedImage && !selectedRemoteSource) ||
      isGenerating
    ) {
      return;
    }

    stopActivePolling();
    dismissResultReadyToast();
    clearPendingResultImageRecenterTimeout();
    pendingResultImageRecenterRef.current = false;
    setActiveAsyncJobStatus(null);
    setQueuedResultImageUrl(null);
    setResultGeneratedImageId(null);
    setResultImageUrl(null);
    setGenerationPhase("running");
    setErrorState(null);

    try {
      const formData = new FormData();
      formData.set("styleId", selectedPreset.id);
      formData.set("sourceImageType", effectiveSourceImageType);
      formData.set("backgroundChange", effectiveBackgroundChange ? "true" : "false");
      formData.set("model", effectiveSelectedModel);
      // ポーズ・アングル指示: 非空のときのみ送る (省略 = 現行挙動)。
      // サーバ側 (generate-async) が free_pose を含意し、admin viewer 検証も行う。
      if (effectivePosePrompt.length > 0) {
        formData.set("posePrompt", effectivePosePrompt);
      }
      if (
        selectedPreset.imageInputMode === "dual" &&
        selectedPreset.dualReferenceSource === "user_upload" &&
        userReferenceImage
      ) {
        formData.set("uploadImage2", userReferenceImage);
      }
      if (
        selectedPreset.category.showUserPromptInput &&
        userPromptInputValue.trim().length > 0
      ) {
        formData.set("userPrompt", userPromptInputValue);
      }
      // category 単位で「最後に submit したプロンプト」を localStorage に記憶し、
      // 次回 /style 来訪時に prefill する。空(=クリア後)送信は記憶を消去する。
      if (selectedPreset.category.showUserPromptInput) {
        saveUserPromptForCategory(
          selectedPreset.category.key,
          userPromptInputValue,
        );
      }

      if (selectedRemoteSource?.kind === "stock") {
        // ストック画像: サーバ側で source_image_stocks から URL を解決。
        formData.set("sourceImageStockId", selectedRemoteSource.id);
      } else if (selectedRemoteSource?.kind === "generated") {
        // 生成済み画像: サーバ側で generated_images から URL を解決。
        formData.set("sourceImageGeneratedId", selectedRemoteSource.id);
      } else if (uploadedImage) {
        // 直接アップロード: normalize してから File として送る。
        const normalizedFile = await normalizeSourceImage(uploadedImage.file);
        formData.set("uploadImage", normalizedFile);
      }

      const response = await fetch("/style/generate-async", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            jobId?: string;
            status?: AsyncGenerationStatus["status"];
            signupCta?: boolean;
            signupPath?: string;
            showRateLimitDialog?: boolean;
          }
        | null;

      if (!response.ok) {
        if (payload?.showRateLimitDialog === true) {
          setRateLimitDialogMessage(payload?.error || t("guestRateLimitShort"));
          setGenerationPhase("idle");
          refreshRateLimitStatus();
          return;
        }

        setErrorState({
          message: payload?.error || t("generationFailed"),
          showSignupCta: payload?.signupCta === true,
          signupPath:
            typeof payload?.signupPath === "string" ? payload.signupPath : undefined,
        });
        setGenerationPhase("idle");
        refreshRateLimitStatus();
        return;
      }

      if (!payload?.jobId || typeof payload.jobId !== "string") {
        throw new Error(t("unknownError"));
      }

      const initialStatus =
        payload.status === "queued" ||
        payload.status === "processing" ||
        payload.status === "succeeded" ||
        payload.status === "failed"
          ? payload.status
          : "queued";
      setActiveAsyncJobStatus({
        id: payload.jobId,
        status: initialStatus,
        processingStage: "queued",
        previewImageUrl: null,
        resultImageUrl: null,
        errorMessage: null,
        generatedImageId: null,
      });

      const latestKnownStatus = await getGenerationStatus(payload.jobId).catch(() => ({
        id: payload.jobId as string,
        status: initialStatus,
        processingStage: "queued" as const,
        previewImageUrl: null,
        resultImageUrl: null,
        errorMessage: null,
        generatedImageId: null,
      }));
      setActiveAsyncJobStatus(latestKnownStatus);

      const { promise, stop } = pollGenerationStatus(payload.jobId, {
        interval: getStyleAsyncPollingIntervalMs,
        onStatusUpdate: (status) => {
          setActiveAsyncJobStatus(status);
        },
      });
      activePollStopRef.current = stop;

      const finalStatus = await promise;
      stopActivePolling();
      setActiveAsyncJobStatus(finalStatus);

      if (finalStatus.status !== "succeeded" || !finalStatus.resultImageUrl) {
        handleGenerationError(
          finalStatus.errorMessage || t("generationFailed")
        );
        refreshRateLimitStatus();
        void refreshPercoinBalance();
        return;
      }

      setResultImageUrl(finalStatus.resultImageUrl);
      setQueuedResultImageUrl(finalStatus.resultImageUrl);
      setResultGeneratedImageId(finalStatus.generatedImageId ?? null);
      setGenerationPhase("completing");
      refreshRateLimitStatus();
      void refreshPercoinBalance();
      // 生成結果一覧（use cache）を最新化。/coordinate と同じく
      // revalidate API → router.refresh() の順で叩いて、現在マウント中の
      // ページの RSC ペイロードを再フェッチさせる（router.refresh が無いと
      // 生成完了後にスケルトンが出っぱなしになる）。
      void (async () => {
        try {
          await fetch("/api/revalidate/style", { method: "POST" });
        } catch {
          // 無効化失敗時も refresh は継続する
        }
        router.refresh();
      })();
      void recordStyleUsageClientEvent({
        eventType: "generate",
        styleId: selectedPreset.id,
      }).catch(() => {
        // Tracking failures should not affect the page UX.
      });
      // コレクション進捗を即時再チェック(全画面チェッカーへ通知)。
      // 非同期生成で他画面にいてもポーリングが拾うが、style画面では即時に出す。
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(COLLECTION_PROGRESS_REFRESH_EVENT));
      }
    } catch (error) {
      handleGenerationError(
        error instanceof Error ? error.message : t("unknownError")
      );
      void refreshPercoinBalance();
    }
  };

  const generateImage = async () => {
    if (shouldUseAsyncGeneration) {
      await generateImageWithAsyncJob();
      return;
    }

    await generateImageWithSynchronousPreview();
  };

  const handleGenerate = () => {
    void runAfterResultResetCheck(() => {
      void generateImage();
    }, "regenerate");
  };

  const resultConfirmationTitle =
    resultConfirmationIntent === "regenerate"
      ? effectiveAuthState === "authenticated"
        ? t("resultReplaceConfirmTitleAuthenticated")
        : t("resultReplaceConfirmTitle")
      : effectiveAuthState === "authenticated"
        ? t("resultResetConfirmTitleAuthenticated")
        : t("resultResetConfirmTitle");
  const resultConfirmationDescription =
    resultConfirmationIntent === "regenerate"
      ? effectiveAuthState === "authenticated"
        ? t("resultReplaceConfirmDescriptionAuthenticated")
        : t("resultReplaceConfirmDescription")
      : effectiveAuthState === "authenticated"
        ? t("resultResetConfirmDescriptionAuthenticated")
        : t("resultResetConfirmDescription");
  const resultConfirmationActionLabel =
    resultConfirmationIntent === "regenerate"
      ? effectiveAuthState === "authenticated"
        ? t("resultReplaceConfirmActionAuthenticated")
        : t("resultReplaceConfirmAction")
      : effectiveAuthState === "authenticated"
        ? t("resultResetConfirmActionAuthenticated")
        : t("resultResetConfirmAction");
  const generationStatusTitle = isCompletingGeneration
    ? t("generationStatusCompleteTitle")
    : t("generationStatusTitle");
  const generationStatusHint = isCompletingGeneration
    ? t("generationStatusCompleteHint")
    : t("generationStatusHint");
  const showGenerateCost = effectiveAuthState === "authenticated";

  useEffect(() => {
    if (!selectedPreset || hasTrackedVisitRef.current) {
      return;
    }

    hasTrackedVisitRef.current = true;
    void recordStyleUsageClientEvent({
      eventType: "visit",
      styleId: null,
    }).catch(() => {
      // Tracking failures should not affect the page UX.
    });
  }, [selectedPreset]);

  return (
    <div className="space-y-8">
      <section className="space-y-3" data-tour="style-tour-preset">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("sectionTitle")}
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            {t("sectionDescription")}
          </p>
        </div>
        <div
          ref={presetStripRef}
          data-testid="style-preset-strip"
          className={`flex gap-4 overflow-x-auto pb-2 ${
            isPresetStripDragging ? "cursor-grabbing select-none" : "md:cursor-grab"
          }`}
          onMouseDown={handlePresetStripMouseDown}
          onClickCapture={handlePresetStripClickCapture}
          onDragStart={(event) => event.preventDefault()}
        >
          {presets.map((preset) => {
            // ゲストは coordinate 以外のカテゴリを生成できないため、カードを
            // 半透明にして「ログインで生成可能！」ラベルを重ねる。
            const isGuestLockedCard =
              effectiveAuthState !== "authenticated" &&
              preset.category.key !== "coordinate";
            return (
              <StylePresetPreviewCard
                key={preset.id}
                preset={preset}
                isSelected={preset.id === selectedPreset?.id}
                onClick={() => handlePresetSelect(preset.id)}
                buttonRef={buildPresetButtonRef(preset.id)}
                alt={t("styleCardAlt", { name: preset.title })}
                disabled={isGenerating || isGuestResultLocked}
                locale={styleCardLocale}
                lockedLabel={
                  isGuestLockedCard
                    ? t("guestCategoryLoginAction")
                    : undefined
                }
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-6">
        {/* チュートリアル Step2: 見出しごとハイライトする */}
        <div data-tour="style-tour-character" className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {t("characterSectionTitle")}
            </h2>
            <p className="text-sm leading-6 text-slate-500">
              {t("characterSectionDescription")}
            </p>
          </div>
          <section
            data-testid="style-reference-card"
            className={`relative ml-auto rounded-xl border border-slate-200 bg-white shadow-sm transition-[width,padding] duration-200 ${
              isReferenceCardCollapsed ? "w-[50%] p-2" : "w-full p-4"
            }`}
          >
            <button
              type="button"
              onClick={() => setIsReferenceCardCollapsed((previous) => !previous)}
              className={`absolute z-30 inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
                isReferenceCardCollapsed ? "right-1 top-1" : "right-2 top-2"
              }`}
              disabled={isGenerating}
              aria-label={
                isReferenceCardCollapsed
                  ? t("expandReferenceCardAria")
                  : t("collapseReferenceCardAria")
              }
              title={
                isReferenceCardCollapsed
                  ? t("expandReferenceCardTitle")
                  : t("collapseReferenceCardTitle")
              }
            >
              {isReferenceCardCollapsed ? (
                <Maximize2 size={12} aria-hidden="true" />
              ) : (
                <Minimize2 size={12} aria-hidden="true" />
              )}
            </button>

            <div
              className={`grid grid-cols-2 ${
                isReferenceCardCollapsed ? "gap-1 md:gap-1" : "gap-3 md:gap-6"
              }`}
            >
              <div className="min-w-0">
                <ImageUploader
                  onImageUpload={handleUpload}
                  onImageRemove={handleUploadRemove}
                  value={
                    uploadedImage ??
                    (selectedRemoteSource
                      ? { previewUrl: selectedRemoteSource.previewUrl }
                      : null)
                  }
                  label={t("uploadLabel")}
                  addImageLabel={t("addImageAction")}
                  compact={isReferenceCardCollapsed}
                  disabled={isGenerating || isGuestResultLocked}
                  aspectRatio={selectedPresetAspectRatio}
                  filledPreviewMode="natural"
                />
              </div>

              {selectedPreset ? (
                <StyleReferencePanel
                  label={t("styleLabel")}
                  imageSrc={selectedPreset.thumbnailImageUrl}
                  imageAlt={t("styleImageAlt")}
                  className={isReferenceCardCollapsed ? "min-w-0 space-y-1" : "min-w-0 space-y-3"}
                  collapsed={isReferenceCardCollapsed}
                  aspectRatio={selectedPresetAspectRatio}
                  tooltip={(() => {
                    const guidance =
                      (styleCardLocale === "en"
                        ? selectedPreset.category.userGuidanceEn
                        : selectedPreset.category.userGuidanceJa) ?? null;
                    if (!guidance) return null;
                    return (
                      <LabelInfoTooltip
                        ariaLabel={t("userGuidanceTooltipAria")}
                        content={
                          <span className="whitespace-pre-line">{guidance}</span>
                        }
                        contentClassName="max-w-[20rem] px-3 py-2 text-sm leading-6"
                      />
                    );
                  })()}
                />
              ) : null}
            </div>

            <div className="mt-3">
              <ImageSourcePickerTrigger
                onClick={picker.openPicker}
                disabled={isGenerating || isGuestResultLocked}
              />
            </div>
          </section>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            {shouldShowSourceImageTypeControl ? (
              <div>
                <Label className="text-base font-medium block">
                  {t("sourceImageTypeLabel")}
                </Label>
                <RadioGroup
                  value={sourceImageType}
                  onValueChange={(value) =>
                    handleSourceImageTypeChange(value as SourceImageType)
                  }
                  className="mt-2 flex items-center gap-6"
                  disabled={isGenerating || isGuestResultLocked}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      id="style-source-image-type-illustration"
                      value="illustration"
                    />
                    <Label
                      htmlFor="style-source-image-type-illustration"
                      className="text-sm font-medium leading-none"
                    >
                      {t("sourceImageTypeIllustration")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      id="style-source-image-type-real"
                      value="real"
                    />
                    <Label
                      htmlFor="style-source-image-type-real"
                      className="text-sm font-medium leading-none"
                    >
                      {t("sourceImageTypeReal")}
                    </Label>
                  </div>
                </RadioGroup>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {t("sourceImageTypeHint")}
                </p>
              </div>
            ) : null}

            {/*
              preset.dualReferenceSource='user_upload' のとき、ユーザーが image_1 を
              その都度アップロードする UI を表示する。アップロード画像のタイプの直下
              (= coordinate 画面と同じく preset カスタマイズ入力を集約) に置く。
            */}
            {selectedPreset &&
              selectedPreset.imageInputMode === "dual" &&
              selectedPreset.dualReferenceSource === "user_upload" && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4">
                  <Label
                    htmlFor="user-reference-image"
                    className="text-base font-medium text-amber-900"
                  >
                    {t("userReferenceImageLabel")}
                  </Label>
                  <p className="text-xs text-amber-800">
                    {t("userReferenceImageHint")}
                  </p>
                  <input
                    key={selectedPreset?.id}
                    id="user-reference-image"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    disabled={isGenerating}
                    onChange={(event) => {
                      const next = event.target.files?.[0] ?? null;
                      setUserReferenceImage(next);
                    }}
                    className="block w-full text-sm text-amber-900"
                  />
                  {userReferenceImage && (
                    <p className="text-xs text-amber-900">
                      {userReferenceImage.name}
                    </p>
                  )}
                </div>
              )}

            {/*
              category.showUserPromptInput=true のとき、ユーザープロンプト入力欄を
              アップロード画像タイプの直下に表示する (coordinate 画面と同じ並び)。
              生成時に preset.stylingPrompt の後ろに結合される (= preset で大枠を決め、
              ユーザーが細部追加)。
            */}
            {selectedPreset?.category.showUserPromptInput && (
              <PromptInputField
                value={userPromptInputValue}
                onChange={setUserPromptInputValue}
                label={
                  selectedPreset.category.userPromptLabel ??
                  t("userPromptLabel")
                }
                placeholder={
                  selectedPreset.category.userPromptPlaceholder ??
                  t("userPromptPlaceholder")
                }
                hint={t("userPromptHint", { max: userPromptMaxLength })}
                clearLabel={t("userPromptClear")}
                characterCount={t("userPromptCharacterCount", {
                  current: userPromptInputValue.length,
                  max: userPromptMaxLength,
                })}
                maxLength={userPromptMaxLength}
                disabled={isGenerating}
                id="user-prompt"
              />
            )}

            {shouldShowBackgroundChangeControl ? (
              <div>
                <div className="space-y-2">
                  <Label className="text-base font-medium block">
                    {t("backgroundChangeLabel")}
                  </Label>
                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <Checkbox
                      id="style-background-change"
                      checked={backgroundChange}
                      onCheckedChange={(checked) =>
                        handleBackgroundChangeToggle(checked === true)
                      }
                      disabled={isBackgroundChangeDisabled}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor="style-background-change"
                        className={`text-sm font-medium ${
                          isBackgroundChangeDisabled
                            ? "cursor-not-allowed text-slate-400"
                            : "cursor-pointer text-slate-900"
                        }`}
                      >
                        {t("backgroundChangeCheckbox")}
                      </Label>
                      <p className="text-xs leading-5 text-slate-500">
                        {isBackgroundChangeAvailable
                          ? t("backgroundChangeDescription")
                          : t("backgroundChangeDisabledHint")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {shouldShowPosePromptControl ? (
              <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="style-pose-prompt-toggle"
                    checked={posePromptEnabled}
                    onCheckedChange={(checked) =>
                      setPosePromptEnabled(checked === true)
                    }
                    disabled={isGenerating || isGuestResultLocked}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor="style-pose-prompt-toggle"
                      className="cursor-pointer text-sm font-medium text-slate-900"
                    >
                      {t("posePromptToggleLabel")}
                    </Label>
                    <p className="text-xs leading-5 text-slate-500">
                      {t("posePromptToggleDescription")}
                    </p>
                  </div>
                </div>
                {posePromptEnabled ? (
                  <PromptInputField
                    value={posePromptValue}
                    onChange={setPosePromptValue}
                    label={t("posePromptLabel")}
                    placeholder={t("posePromptPlaceholder")}
                    characterCount={t("userPromptCharacterCount", {
                      current: posePromptValue.length,
                      max: POSE_PROMPT_MAX_LENGTH,
                    })}
                    maxLength={POSE_PROMPT_MAX_LENGTH}
                    disabled={isGenerating || isGuestResultLocked}
                    id="style-pose-prompt"
                  />
                ) : null}
              </div>
            ) : null}

            {shouldShowGenerationModelControl ? (
              <GenerationModelControls
                value={effectiveSelectedModel}
                onChange={handleSelectedModelChange}
                onLockedClick={() => {
                  if (modelAuthState === "guest") {
                    setShowAuthModal(true);
                  } else if (subscriptionPlan === "free") {
                    setIsUpsellOpen(true);
                  }
                }}
                authState={modelAuthState}
                modelLabel={t("modelLabel")}
                disabled={isGenerating}
                isModelSelectable={
                  modelAuthState === "authenticated" &&
                  subscriptionPlan === "free"
                    ? isFreePlanAllowedModel
                    : undefined
                }
              />
            ) : null}

            <div data-tour="style-tour-generate">
              {isGuestRestrictedCategory ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="min-h-[48px] w-full rounded-full border-0 bg-gradient-to-r from-pink-500 to-orange-400 text-base font-bold text-white shadow-[0_6px_16px_rgba(236,72,153,0.28)] transition hover:from-pink-600 hover:to-orange-500"
                  >{t("guestCategoryLoginAction")}</Button>
                  <p className="text-center text-xs leading-5 text-slate-500">{t("guestCategoryLoginHint")}</p>
                </div>
              ) : (
                <GenerationSubmitButton
                  onClick={handleGenerate}
                  disabled={isGenerateDisabled}
                  isGenerating={isGenerating}
                  generateLabel={t("generateButton")}
                  generatingLabel={t("generatingButton")}
                  costAmount={showGenerateCost ? selectedModelPercoinCost : null}
                />
              )}
            </div>
            {!isGuestRestrictedCategory ? (
              <div className="space-y-1 text-xs leading-5 text-slate-500">
                <p>{t("generateHint")}</p>
                <p>{t("generateRetryHint")}</p>
              </div>
            ) : null}

            {typeof remainingDailyNoticeCount === "number" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm font-medium text-amber-900">
                  {t("remainingDailyNotice", {
                    count: remainingDailyNoticeCount,
                  })}
                </p>
              </div>
            ) : null}

            {shouldShowDailyLimitCard ? (
              rateLimitStatus?.authState === "guest" ? (
                // coordinate 画面の上限表示に合わせ、赤枠やボタンは置かず amber の小さめ文字のみ。
                <p className="text-xs leading-5 text-amber-700">
                  {t("guestRateLimitDaily")}
                </p>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-900">
                    {t("authenticatedRateLimitDaily")}
                  </p>
                  <div className="mt-3 space-y-3">
                    <p className="text-xs leading-5 text-red-800">
                      {t("authenticatedPaidContinueHint", {
                        cost: selectedModelPercoinCost,
                      })}
                    </p>
                    <div className="rounded-lg border border-red-100 bg-white/70 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">
                        {t("percoinBalanceLabel")}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-red-900">
                        {percoinBalanceState.isLoading
                          ? t("percoinBalanceLoading")
                          : typeof percoinBalanceState.balance === "number"
                            ? t("percoinBalanceValue", {
                                balance: percoinBalanceState.balance.toLocaleString(),
                              })
                            : t("percoinBalanceUnavailable")}
                      </p>
                    </div>
                    {percoinBalanceState.error ? (
                      <p className="text-xs leading-5 text-red-800">
                        {t("percoinBalanceFetchFailed")}
                      </p>
                    ) : null}
                    {!percoinBalanceState.isLoading &&
                    !percoinBalanceState.error &&
                    !hasEnoughPercoins ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-red-800">
                          {t("authenticatedPaidInsufficientBalance", {
                            cost: selectedModelPercoinCost,
                          })}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => router.push(getPercoinPurchaseUrl())}
                        >
                          {t("percoinPurchaseAction")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            ) : null}

            {isGenerating ? (
              <div ref={generationStatusSectionRef}>
                {isAsyncStatusCard ? (
                  <GenerationStatusCard
                    title={generationStatusTitle}
                    message={asyncStatusCardMessage}
                    liveMessage={asyncStatusCardLiveMessage}
                    footerText={asyncStatusCardHint}
                    progress={asyncStatusCardProgress}
                    progressTransitionDurationMs={
                      asyncStatusCardProgressTransitionDurationMs
                    }
                    animateFromZeroOnMount
                    isComplete={isCompletingGeneration}
                    prefersReducedMotion={asyncStatusCardPrefersReducedMotion}
                  />
                ) : (
                  <StyleGenerationStatusCard
                    title={generationStatusTitle}
                    message={guestStatusCardMessage}
                    liveMessage={guestStatusCardLiveMessage}
                    hint={generationStatusHint}
                    slowHint={t("generationStatusSlowHint")}
                    progress={guestStatusCardProgress}
                    isLongWait={guestStatusCardIsLongWait}
                    isComplete={isCompletingGeneration}
                    prefersReducedMotion={guestStatusCardPrefersReducedMotion}
                  />
                )}
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      {errorState ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{errorState.message}</p>
          {errorState.showSignupCta ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-red-800">
                {t("guestRateLimitSignupHint")}
              </p>
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => handleSignupCtaClick(errorState.signupPath)}
              >
                {t("guestRateLimitSignupAction")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {resultGeneratedImageId ? (
        <PostModal
          open={isPostModalOpen}
          onOpenChange={setIsPostModalOpen}
          imageId={resultGeneratedImageId}
        />
      ) : null}

      {/*
        即時結果表示パネルは未ログインユーザー向け（履歴 DB が無いため）。
        ログインユーザーは生成結果一覧（GenerationStateProvider 配下の
        スケルトン → 生成完了で画像差替え）が同じ役割を担うため、
        ページ側 (app/(app)/style/page.tsx) から showResultPanel=false で
        非表示にする。デフォルトは表示で、テストや単体利用時の挙動を維持。
      */}
      {showResultPanel ? (
        <div ref={resultSectionRef}>
          <GenerationResultPanel
            title={t("resultsTitle")}
            placeholder={t("resultPlaceholder")}
            resultImageUrl={displayedResultImageUrl}
            resultImageAlt={t("resultImageAlt")}
            aspectRatio={resultShellAspectRatio}
            onResultImageLoad={handleResultImageLoad}
            action={
              displayedResultImageUrl ? (
                <div className="flex items-center gap-2">
                  <StyleResultDownloadButton
                    imageUrl={resultImageUrl ?? displayedResultImageUrl}
                    styleId={selectedPreset?.id ?? "unknown"}
                    label={t("downloadAction")}
                    ariaLabel={t("downloadAriaLabel")}
                    successTitle={t("downloadSuccessTitle")}
                    successDescription={t("downloadSuccessDescription")}
                    failedMessage={t("downloadFailed")}
                    transformBlob={
                      effectiveAuthState !== "authenticated"
                        ? applyPerstaWatermark
                        : undefined
                    }
                  />
                  {wardrobeSave.isGuest ? (
                    <WardrobeSaveButton onClick={handleWardrobeSaveClick} />
                  ) : null}
                  {canPostGeneratedResult ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPostModalOpen(true)}
                      className="flex h-9 items-center gap-2 rounded-full border-slate-300 px-3 text-sm font-medium text-slate-700 shadow-sm"
                    >
                      <Share2 className="h-4 w-4" />
                      <span>{postsT("postSubmit")}</span>
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
            footer={
              <p className="text-xs leading-5 text-slate-500">
                {effectiveAuthState !== "authenticated"
                  ? t("wardrobeSaveHelper")
                  : t("resultSaveHint")}
              </p>
            }
          />
        </div>
      ) : null}

      <AlertDialog
        open={isResultResetDialogOpen}
        onOpenChange={handleResultResetDialogChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resultConfirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {resultConfirmationDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("resultResetConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmResultReset}>
              {resultConfirmationActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(rateLimitDialogMessage)}
        onOpenChange={(open) => {
          if (!open) {
            setRateLimitDialogMessage(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rateLimitDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {rateLimitDialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRateLimitDialogMessage(null)}>
              {t("rateLimitDialogClose")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ロックモデル等の通常ログイン導線 */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        redirectTo={currentUrl}
      />

      {/* ゲスト保存（ログイン転換）導線: signup 固定 */}
      <AuthModal {...wardrobeSave.authModalProps} />

      {/* ログイン後の claim 表示(保存中 / 保存完了)。自動遷移はしない。 */}
      <WardrobeClaimOverlay
        status={wardrobeSave.claimStatus}
        onView={wardrobeSave.goToSavedImage}
        onClose={wardrobeSave.dismissClaim}
      />

      <SubscriptionUpsellDialog
        open={isUpsellOpen}
        onOpenChange={setIsUpsellOpen}
      />

      <ImageSourcePicker
        open={picker.open}
        onOpenChange={picker.setOpen}
        activeTab={picker.activeTab}
        onTabChange={picker.setActiveTab}
        onSelectGenerated={handleSelectGenerated}
        onSelectStock={handleSelectStock}
        disabled={isGenerating}
        pendingGeneratedId={null}
        pendingStockId={null}
        currentPreviewUrl={
          selectedRemoteSource?.previewUrl ??
          uploadedImage?.previewUrl ??
          null
        }
      />
    </div>
  );
}

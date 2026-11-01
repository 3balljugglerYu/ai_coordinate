"use client";
import { CatalogReviewProgress } from "@/features/catalog-references/components/CatalogReviewProgress";

import { useState, useEffect, useCallback, useRef, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { ImageUploader } from "./ImageUploader";
import { GenerationModelControls } from "./GenerationModelControls";
import { GenerationSubmitButton } from "./GenerationSubmitButton";
import { useToast } from "@/components/ui/use-toast";
import { extractPromptOptions } from "@/shared/generation/prompt-options-extract";
import { GeneratedImagesFromSource } from "./GeneratedImagesFromSource";
import { ImageSourcePicker } from "./ImageSourcePicker/ImageSourcePicker";
import { ImageSourcePickerTrigger } from "./ImageSourcePickerTrigger";
import { PromptInputField } from "./PromptInputField";
import { GachaPromptField } from "./GachaPromptField";
import { NamePromptField } from "./NamePromptField";
import { NameInputEntryField } from "./NameInputEntryField";
import { CatalogReferencePicker } from "@/features/catalog-references/components/CatalogReferencePicker";
import { CatalogReferenceIntro } from "@/features/catalog-references/components/CatalogReferenceIntro";
import { CreateModeSwipePanel } from "./CreateModeSwipePanel";
import { CatalogTabBar } from "@/features/style-presets/components/CatalogTabBar";
import type { CatalogReferenceAccess, CatalogReferenceValue } from "@/features/catalog-references/types";
import { CatalogReferenceTakes } from "@/features/catalog-references/components/CatalogReferenceTakes";
import type { CatalogReferenceTake } from "@/shared/generation/catalog-reference";
import { PromptGimmicksBox } from "./PromptGimmicksBox";
import {
  checkNameInputValue,
  countReachableNameInputSlots,
  describeNameInputForUsers,
  exceedsNameInputSlotLimit,
  hasGuaranteedRequiredNameInput,
  nameInputMaxSlotsFor,
  usesGachaWithNameInput,
  composeNameInputPrompt,
  nameInputHeadingReference,
  type NameInputSlot,
  type NameInputForUsers,
} from "@/shared/generation/name-input";
import {
  GACHA_FIELD_TEMPLATE,
  composeGachaPrompt,
  gachaLimitsFor,
  validateGachaField,
} from "@/shared/generation/gacha-prompt";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import {
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import type { SourceImageStock } from "../lib/database";
import {
  getPercoinCost,
  isFreePlanAllowedModel,
  resolveEffectiveModelForAuthState,
} from "../lib/model-config";
import {
  readPreferredBackgroundMode,
  markGptImage25Forced,
  readPreferredModel,
  shouldForceGptImage25,
  writePreferredBackgroundMode,
  writePreferredModel,
  readPreferredAspectMode,
  writePreferredAspectMode,
} from "../lib/form-preferences";
import { AspectRatioSelector } from "./AspectRatioSelector";
import { useGptImage25Available } from "./GptImage25AvailabilityProvider";
import { useNanoBanana21Available } from "./NanoBanana21AvailabilityProvider";
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
    /** 名前の欄に入れる名前(じゆうモード。空なら送らない)。 */
    nameInput?: string;
    /** 見本の id とまねるもの(見本を使える人が見本を選んだときだけ) */
    referenceImageId?: string;
    referenceTakes?: CatalogReferenceTake[];
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
  lockedPromptText?: string | null;  /**
   * 「ガチャプロンプトにする」を出してよいか。/free のサーバー側で
   * `isGachaPromptAvailable`(公開フラグ OR 運営)を判定して渡す。既定は出さない。
   */
  gachaPromptAvailable?: boolean;
  /**
   * 「ガチャに分ける」道具(1回5ペルコイン)を出してよいか。/free のサーバー側で
   * `isGachaSplitAvailable` を判定して渡す。ガチャの欄の中に出すので、ガチャが使えるときだけ効く。
   */
  gachaSplitAvailable?: boolean;
  /**
   * ガチャの上限(囲みの数・候補の数)を掛けない(運営だけ。テストのため。2026-10-05 ユーザー指示)。
   * 一般の利用者は囲み1つ・候補10個まで(gachaLimitsFor)。
   */
  gachaUnlimited?: boolean;
  /**
   * 「名前を入れられるようにする」を出してよいか(docs/planning/name-input-slot-plan.md)。
   * /free のサーバー側で `isNameInputAvailable`(公開フラグ OR 運営)を判定して渡す。既定は出さない。
   */
  nameInputAvailable?: boolean;
  /** 名前の欄の数を制限しない(運営だけ。サーバーの nameInputMaxSlotsFor と同じ)。 */
  nameInputUnlimited?: boolean;
  /**
   * 見本(参照画像)の欄に要る値(docs/planning/i2i-catalog-review-implementation-plan.md)。
   * /free のサーバー側で、見本を使える人の一覧(運営が選んだ人)に入っているときだけ渡す。渡さなければ欄を出さない。
   */
  catalogReference?: CatalogReferenceAccess;
  /**
   * カタログから使う人の名前の欄(派生生成)。原作の本文に目印があるときだけ、
   * `/api/posts/[id]/prompt-slots` から見出しなどを受け取って渡す(本文は届かない)。
   */
  lockedNameInput?: NameInputForUsers | null;
  /**
   * 名前の欄の情報を取りに行っている間は生成させない(必須の名前を入れる前に送られないように)。
   * 取れなかったときは false に戻り、名前の欄なしで生成できる(サーバーでも必須を確かめる)。
   */
  lockedNameInputLoading?: boolean;
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
  gachaPromptAvailable = false,
  gachaSplitAvailable = false,
  gachaUnlimited = false,
  nameInputAvailable = false,
  nameInputUnlimited = false,
  catalogReference: catalogReferenceAccess,
  lockedNameInput = null,
  lockedNameInputLoading = false,
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
    ? // 取れた本文が空なら、プロンプトなしで作られたカタログ(見本つきの「イラストから」)。非公開とは分ける
      // 本文の API は、見本つきの作品のときだけ空文字を返す(空白だけの本文はそのまま返る)
      lockedPromptText === ""
      ? postsT("sourcePromptEmpty")
      : postsT("lockedSheetPromptLocked")
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
  const picker = useImageSourcePicker({ defaultTab: "generated" });

  // ガチャプロンプト(公開前は運営だけ。カタログ刷新とは別のフラグ)。カタログをつくる(/free)の
  // 自分で書く本文にだけ出す。候補欄は本文の末尾に付けて送り、生成のたびに Worker が候補から1つを選ぶ。
  const canUseGacha =
    isFree && !promptLocked && isAuthenticated && gachaPromptAvailable;
  const [isGachaEnabled, setIsGachaEnabled] = useState(false);
  const [gachaField, setGachaField] = useState(GACHA_FIELD_TEMPLATE);
  // 「ガチャに分ける」の案を見せている間は、本文と候補欄を書き換えさせない
  const [isSplitProposalOpen, setIsSplitProposalOpen] = useState(false);
  // 「本文から名前の欄を作る」の案を見せている間は、本文を書き換えさせない(ガチャの道具と同じ)
  const [isNameCreateProposalOpen, setIsNameCreateProposalOpen] = useState(false);
  const isGachaActive = canUseGacha && isGachaEnabled;
  const gachaValidation = isGachaActive
    ? validateGachaField(gachaField, gachaLimitsFor(gachaUnlimited))
    : null;

  // 文字入力の欄(公開前は運営だけ)。設定(ラベル・入力のヒント)は本文とは別に持ち、
  // 送るときに目印を本文の先頭へ付ける(ガチャの欄と同じ考え方。本文に目印を出さない。2026-10-11 ユーザー指示)
  const canUseNameInput =
    isFree && !promptLocked && isAuthenticated && nameInputAvailable;

  // 見本(参照画像)。見本を使える人が、自分で書く本文のときだけ(派生生成では元の作品の見本が使われる)
  const canUseCatalogReference =
    isFree && !promptLocked && isAuthenticated && catalogReferenceAccess !== undefined;
  // 見本の欄に渡す値(使えるときだけ)。値があるかを1か所で確かめ、そのまま渡す
  const referenceAccess = canUseCatalogReference ? catalogReferenceAccess : undefined;
  // 見本を使える人だけ、「プロンプトから」「イラストから」のタブで作り方を選ぶ(既定はプロンプトから)
  const [createMode, setCreateMode] = useState<"prompt" | "reference">("prompt");
  // 「イラストから」のタブで作っているか。見本の欄・まねるもの・送る値・見出しはこれで出し分ける
  const usingReference = createMode === "reference" && referenceAccess !== undefined;
  const [catalogReference, setCatalogReference] = useState<CatalogReferenceValue | null>(null);
  const [isCatalogReferenceUploading, setIsCatalogReferenceUploading] = useState(false);
  const reviewT = useTranslations("catalogReview");
  const [remakeTakes,setRemakeTakes]=useState<CatalogReferenceTake[] | undefined>();
  const [remakeState,setRemakeState]=useState<"idle"|"loading"|"ready"|"failed">("idle");
  useEffect(()=>{
    const remakeId=new URLSearchParams(window.location.search).get("remake");
    if(!remakeId)return;
    if(!canUseCatalogReference){setRemakeState("failed");return;}
    let active=true;
    const controller=new AbortController();
    setRemakeState("loading");
    fetch(`/api/catalog-references/remake/${encodeURIComponent(remakeId)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)throw new Error();return response.json();})
      .then((data:{prompt:string;takes:CatalogReferenceTake[]})=>{
        if(!active)return;
        setPrompt(data.prompt);setRemakeTakes(data.takes);setCreateMode("reference");setRemakeState("ready");
      }).catch(()=>{if(active)setRemakeState("failed");});
    return ()=>{active=false;controller.abort();};
  },[canUseCatalogReference]);
  // 「イラストから」は、見本を入れてまねるものを1つ以上選ぶまで送らない(上げている間も送らない)。
  // プロンプトは、なくてもよい
  const catalogReferenceBlocksSubmit =
    remakeState === "loading" || (usingReference &&
    (isCatalogReferenceUploading || catalogReference === null || catalogReference.takes.length === 0));
  const [nameSlotState, setNameSlotState] = useState<NameInputSlot | null>(null);
  const nameSlot = canUseNameInput ? nameSlotState : null;
  // 送る本文(目印＋本文＋ガチャの欄)。数と必須の判定は、これをサーバーと同じ数え方で見る
  // (本文やガチャの欄に手で書いた目印も含む)
  const composeSubmittedPrompt = (body: string) => {
    const withName = composeNameInputPrompt(body, nameSlot);
    return isGachaActive ? composeGachaPrompt(withName, gachaField) : withName;
  };
  const nameCheckedPrompt = canUseNameInput ? composeSubmittedPrompt(prompt) : "";

  // 本文に貼り付けたガチャの囲み・文字入力の目印は、それぞれの欄へ移す(2026-10-11 ユーザー決定 案A)。
  // 「使用プロンプト」には送った文(目印・囲み付き)が残るので、それを貼ると欄が2つになって生成できないため。
  // 欄にあった中身は上書きする。何を取り込んだかはスナックバーで知らせる(「元に戻す」は出さない。2026-10-11 ユーザー指示)
  const { toast } = useToast();
  const handlePromptChange = (next: string) => {
    const extracted = extractPromptOptions(next, { gacha: canUseGacha, nameInput: canUseNameInput });
    if (!extracted) {
      setPrompt(next);
      return;
    }
    setPrompt(extracted.body);
    const movedGacha = extracted.gachaField !== null;
    if (movedGacha) {
      setGachaField(extracted.gachaField!);
      setIsGachaEnabled(true);
    }
    if (extracted.nameSlot) setNameSlotState(extracted.nameSlot);
    toast({
      title: freeT("promptOptionsImportedTitle"),
      description: freeT(
        movedGacha && extracted.nameSlot
          ? "promptOptionsImportedBoth"
          : movedGacha
            ? "promptOptionsImportedGacha"
            : "promptOptionsImportedTextInput",
      ),
    });
  };
  const hasReachableNameSlot =
    canUseNameInput && countReachableNameInputSlots(nameCheckedPrompt) > 0;
  const isNameRequiredGuaranteed =
    canUseNameInput && hasGuaranteedRequiredNameInput(nameCheckedPrompt);
  const hasTooManyNameSlots =
    canUseNameInput &&
    exceedsNameInputSlotLimit(nameCheckedPrompt, nameInputMaxSlotsFor(nameInputUnlimited));
  /*
    ガチャと文字入力は、一般の利用者はどちらか1つだけ(一緒に使えるのはサブスクの構想。2026-10-07
    ユーザー決定)。片方をオンにしている間は、もう片方のスイッチを押せなくして理由を出す。
    運営は制限しない(テストのため)。受付(generate-async)でも同じく止める
  */
  const canCombineGachaAndText = nameInputUnlimited;
  const exclusiveNote =
    canUseGacha && canUseNameInput && !canCombineGachaAndText ? freeT("gachaTextExclusiveNote") : undefined;
  const nameSwitchLockedReason = isGachaActive ? exclusiveNote : undefined;
  const gachaSwitchLockedReason = nameSlot !== null ? exclusiveNote : undefined;
  // 手で目印を書くなどして、それでも一緒になったときは送らせない(受付で断られるため)
  const hasGachaTextConflict =
    canUseNameInput &&
    isGachaActive &&
    !canCombineGachaAndText &&
    usesGachaWithNameInput(nameCheckedPrompt);
  const [trialName, setTrialName] = useState("");
  const trialNameCheck = checkNameInputValue(trialName);
  // 派生生成(カタログから使う)の名前の欄。作る人の試しの名前と同じ state を使う
  const showsLockedNameInput = isFree && promptLocked && lockedNameInput !== null;
  const isNameInputInvalid = showsLockedNameInput
    ? !trialNameCheck.ok || (lockedNameInput!.required && !trialNameCheck.value)
    : hasTooManyNameSlots ||
      hasGachaTextConflict ||
      (hasReachableNameSlot &&
        (!trialNameCheck.ok || (isNameRequiredGuaranteed && !trialNameCheck.value)));

  const promptLength = prompt.length;
  // 上限は送る本文(ガチャの候補欄を付けた後)で判定する。
  const isPromptTooLong =
    (isGachaActive || nameSlot ? composeSubmittedPrompt(prompt).length : promptLength) > promptMaxLength;
  // ChatGPT Images 2.5 は段階公開中(REQ-014)。運営以外は実効値を既定モデルへ丸める。
  const gptImage25Available = useGptImage25Available();
  // Nano Banana 2.1 も段階公開中。運営以外は実効値を既定モデルへ丸める(REQ-016)
  const nanoBanana21Available = useNanoBanana21Available();
  const effectiveSelectedModel = resolveEffectiveModelForAuthState(
    selectedModel,
    authState,
    { gptImage25Available, nanoBanana21Available }
  );
  const totalPercoinCost = getPercoinCost(effectiveSelectedModel);
  const showCost = authState === "authenticated";

  // ブラウザに保存された前回の選択 (モデル / 背景設定) を復元する。
  // SSR との hydration mismatch を避けるため初期値は default のまま、useEffect で上書きする。
  useEffect(() => {
    const stored = readPreferredModel();

    /*
      既定を 2.5 にしても、以前 2.0 を選んだ端末は保存値が復元されて 2.0 のまま
      になる。**端末ごとに1回だけ** 2.5 へ寄せる(/style と同じ扱い。案内の
      スポットライトは主要導線である /style 側だけで出す)。
    */
    const canSwitch =
      resolveEffectiveModelForAuthState(DEFAULT_GENERATION_MODEL, authState, {
        gptImage25Available,
      }) === DEFAULT_GENERATION_MODEL;

    if (canSwitch && shouldForceGptImage25()) {
      markGptImage25Forced();
      if (stored !== DEFAULT_GENERATION_MODEL) {
        setSelectedModel(DEFAULT_GENERATION_MODEL);
        writePreferredModel(DEFAULT_GENERATION_MODEL);
      } else {
        setSelectedModel(stored);
      }
    } else {
      setSelectedModel(stored);
    }

    setBackgroundMode(readPreferredBackgroundMode());
    // 比率は Free のみ。マウント後に復元(SSR は source、hydration 後に前回値へ)。
    if (isFree) {
      setAspectMode(readPreferredAspectMode());
    }
    // authState / gptImage25Available は確定後に変わりうるが、この寄せは
    // マウント時の 1 回だけでよい(2 度目以降は保存値を尊重する)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const bodyPrompt = resolveSubmittedPrompt(promptLocked, prompt);

    if (!promptLocked) {
      // 「イラストから」はプロンプトなしで作れる(見本とまねるものだけで指示になる)
      if (!bodyPrompt && !usingReference) {
        alert(t("missingPrompt"));
        return;
      }

      if (isPromptTooLong) {
        alert(t("promptTooLong", { max: promptMaxLength }));
        return;
      }
    }

    // 送信ボタンは押せない状態にしてあるが、念のため送る前にも止める。
    if (gachaValidation && !gachaValidation.ok) return;
    if (isNameInputInvalid) return;
    if (promptLocked && lockedNameInputLoading) return;
    if (catalogReferenceBlocksSubmit) return;
    const trimmedPrompt = promptLocked ? bodyPrompt : composeSubmittedPrompt(bodyPrompt);

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
        // 名前の欄があって名前を書いたときだけ送る(空欄は「名前なし」になる)
        ...((hasReachableNameSlot || showsLockedNameInput) && trialNameCheck.ok && trialNameCheck.value
          ? { nameInput: trialNameCheck.value }
          : {}),
        // 「イラストから」のタブで見本を選んだときだけ送る(「プロンプトから」に戻したら送らない)
        ...(usingReference && catalogReference
          ? { referenceImageId: catalogReference.id, referenceTakes: catalogReference.takes }
          : {}),
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
  const isSubmitDisabled =
    isGenerationSubmitDisabled({
      promptLocked,
      prompt,
      promptOptional: usingReference,
      isPromptTooLong,
      hasSourceImage,
      isGenerating,
      guestGenerationLocked,
    }) ||
    (gachaValidation !== null && !gachaValidation.ok) ||
    isNameInputInvalid ||
    (promptLocked && lockedNameInputLoading) ||
    catalogReferenceBlocksSubmit;

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

  // 見本のプレビューも blob: の URL。値を持つここで、差し替え・外したとき・unmount 時に放す
  // (見本の欄の部品が組み直されても、値が残っている間は放さない)
  useEffect(() => {
    const currentUrl = catalogReference?.previewUrl;
    return () => {
      if (currentUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [catalogReference?.previewUrl]);

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

  // /style・/inspire → 「このイラストで生成」 → 確認 → /free 遷移時に
  // sessionStorage に画像 URL が積まれていれば apply-from-history へ転送する。
  // 受け取るのは Free Style のページのフォームだけ。派生生成シート(promptLocked)も
  // 同じ mode="free" だが別の画面の上に開くので、遷移に失敗して残った印を拾わない。
  // 持ち越し先は廃止した Coordinate から Free Style に移した
  // (docs/planning/coordinate-mode-deprecation-plan.md ADR-004)。
  useEffect(() => {
    if (!isFree || promptLocked) return;
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
    // isFree / promptLocked はフォームごとに固定(呼び出し側がリテラルで渡す)。
    // 実質 mount 時の1回だけ動く。印は読んだ時点で消すので、再実行されても二重に入らない
  }, [isFree, promptLocked]);

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

  // 元の画像(うちの子)を上げる部品。見本を使える人の2枚並べでは、見出しを読み上げだけに残して縦長にする
  const renderSourceImageUploader = (
    layout: Pick<ComponentProps<typeof ImageUploader>, "label" | "hideLabel" | "aspectRatio"> = {},
  ) => (
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
      {...layout}
    />
  );

  if (remakeState === "loading") return <p role="status">{reviewT("loading")}</p>;

  return (
    <>
    {/*
      見本を使える人だけ、何で作るかをタブで選ぶ(一般の人の画面は今のまま)。
      User ORIGINAL と同じく、タブは枠の外の帯に置く(見た目は StylesCatalogChipBar と同じ)。
      /free はスマホでもヘッダーが固定で、入力中はヘッダーだけが隠れるので、帯は上に留めない
      (留めるとヘッダーの下に隠れたり、入力中の欄をふさいだりする)。カタログ刷新のフラグにもよらない
    */}
    {referenceAccess ? (
      <>
        <div
          className="-mx-4 mb-4 border-b bg-white px-4 pt-1 shadow-sm"
          data-testid="create-tab-bar"
        >
          <CatalogTabBar
            tabs={[
              { id: "prompt", label: freeT("createTabPrompt") },
              { id: "reference", label: freeT("createTabReference") },
            ]}
            activeId={createMode}
            onSelect={setCreateMode}
            ariaLabel={freeT("createTabsLabel")}
          />
        </div>
        <CatalogReferenceIntro
          userId={referenceAccess.userId}
          consentedBefore={referenceAccess.consentedBefore}
          onTry={() => setCreateMode("reference")}
        />
      </>
    ) : null}
    <CreateModeSwipePanel activeMode={createMode} onModeChange={setCreateMode} enabled={referenceAccess !== undefined}>
    <Card className="p-6">
      <div className="space-y-6">
        {/* 画像入力エリア: アップローダ常時表示 + ピッカートリガ */}
        <div className="space-y-3">
          <Label className="text-base font-medium block">
            {usingReference ? freeT("catalogReferenceImagesLabel") : t("imageSourceLabel")}
          </Label>
          {referenceAccess ? (
            <>
              {/*
                見本の欄は「イラストから」のときだけ見せる。タブを切り替えても作り直さず、隠すだけにする
                (この画面での同意や、上げている途中の状態を消さないため)。
                うちの子の欄は、見せている側にだけ置く(同じ欄を2つ出さない)
              */}
              <div hidden={!usingReference} data-testid="catalog-reference-panel">
                <CatalogReviewProgress status="creating" />
                {/* うちの子と見本の2枚並べ(第2案)。見出しは並べた欄の下に出す(読み上げには残す) */}
                <CatalogReferencePicker
                  ownImage={
                    usingReference
                      ? renderSourceImageUploader({
                          label: freeT("catalogReferenceOwnImageLabel"),
                          hideLabel: true,
                          aspectRatio: 3 / 4,
                        })
                      : null
                  }
                  value={catalogReference}
                  initialTakes={remakeTakes}
                  onChange={setCatalogReference}
                  onUploadingChange={setIsCatalogReferenceUploading}
                  disabled={isGenerating}
                  consented={referenceAccess.consented}
                  consentedBefore={referenceAccess.consentedBefore}
                  active={usingReference}
                />
              </div>
              {usingReference ? null : renderSourceImageUploader()}
            </>
          ) : (
            renderSourceImageUploader()
          )}
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
          />
        </div>

        {remakeState !== "idle" ? <p role={remakeState === "failed" ? "alert" : "status"} className="rounded-xl bg-violet-50 p-3 text-sm">
          {reviewT(remakeState === "ready" ? "remakeReady" : remakeState === "failed" ? "remakeFailed" : "loading")}
        </p> : null}

        {/* 見本から、まねるもの(「イラストから」で見本を入れたときだけ。画像の欄の下) */}
        {usingReference && catalogReference ? (
          <CatalogReferenceTakes
            value={catalogReference}
            onChange={setCatalogReference}
            disabled={isGenerating}
          />
        ) : null}

        {/* 名前の欄(カタログから使う人。画像の下。2026-10-06 ユーザー決定) */}
        {showsLockedNameInput ? (
          <NameInputEntryField
            slot={lockedNameInput!}
            value={trialName}
            onChange={setTrialName}
            disabled={isGenerating}
          />
        ) : null}

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
          onChange={promptLocked ? () => {} : handlePromptChange}
          // 「イラストから」ではプロンプトはなくてもよいので、見出しの下の説明で伝える
          label={usingReference ? freeT("referencePromptLabel") : promptLabel}
          hint={usingReference ? freeT("referencePromptHint") : undefined}
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
          disabled={
            promptLocked ||
            isGenerating ||
            isTutorialInProgress ||
            (isGachaActive && isSplitProposalOpen) ||
            isNameCreateProposalOpen
          }
          containerProps={
            isFree ? undefined : { "data-tour": "tour-prompt-input" }
          }
          // じゆうモードはラベルが短い(「生成したい内容」)ためスマホでも 1 行に収める。
          labelRowSingleLine={isFree}
        />

        {canUseGacha || canUseNameInput ? (
          <PromptGimmicksBox>
            {canUseNameInput ? (
              <NamePromptField
                slot={nameSlot}
                onSlotChange={(slot) => {
                  // 本文で見出し(例: 【名前】)を使って文字を指しているときは、ラベルを変えたら一緒に書き換える
                  // (「本文から文字入力の欄を作る」道具が、見本の名前をこの見出しに置き換えるため)
                  if (nameSlotState) {
                    const before = nameInputHeadingReference(nameSlotState);
                    const after = nameInputHeadingReference(slot);
                    if (before !== after) {
                      setPrompt((current) => current.split(before).join(after));
                    }
                  }
                  setNameSlotState(slot);
                }}
                onDisable={() => {
                  // 試しの名前は消さない(オンに戻したら使える。切っている間は送らない)
                  setNameSlotState(null);
                }}
                trialName={trialName}
                onTrialNameChange={setTrialName}
                hasReachableSlot={hasReachableNameSlot}
                // 試しの欄の見出しは、使う人・AI に届くものと同じ(ガチャの欄だけの目印・空の見出しも含めて)
                trialLabel={
                  hasReachableNameSlot ? describeNameInputForUsers(nameCheckedPrompt)?.label : undefined
                }
                requiredGuaranteed={isNameRequiredGuaranteed}
                tooManySlots={hasTooManyNameSlots}
                lockedReason={nameSwitchLockedReason}
                createTool={{
                  prompt,
                  onApply: setPrompt,
                  onProposalOpenChange: setIsNameCreateProposalOpen,
                }}
                disabled={
                  isGenerating ||
                  isTutorialInProgress ||
                  isSplitProposalOpen ||
                  isNameCreateProposalOpen
                }
              />
            ) : null}
            {canUseGacha ? (
              <GachaPromptField
                enabled={isGachaEnabled}
                onEnabledChange={setIsGachaEnabled}
                value={gachaField}
                onChange={setGachaField}
                validation={gachaValidation}
                disabled={isGenerating || isTutorialInProgress || isNameCreateProposalOpen}
                split={
                  gachaSplitAvailable
                    ? {
                        prompt,
                        onApply: (nextBody, nextField) => {
                          setPrompt(nextBody);
                          setGachaField(nextField);
                        },
                        onProposalOpenChange: setIsSplitProposalOpen,
                      }
                    : undefined
                }
                fieldLocked={isSplitProposalOpen}
                lockedReason={gachaSwitchLockedReason}
              />
            ) : null}
            {hasGachaTextConflict ? (
              <p className="text-xs text-red-600" role="alert" data-testid="gacha-text-conflict">
                {freeT("gachaTextTogetherError")}
              </p>
            ) : null}
          </PromptGimmicksBox>
        ) : null}

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
    </CreateModeSwipePanel>
    </>
  );
}

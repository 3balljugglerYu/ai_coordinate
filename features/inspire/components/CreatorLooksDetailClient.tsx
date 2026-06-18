"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/use-toast";
import { ImageUploader } from "@/features/generation/components/ImageUploader";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";
import { GenerationModelControls } from "@/features/generation/components/GenerationModelControls";
import { GenerationSubmitButton } from "@/features/generation/components/GenerationSubmitButton";
import {
  creatorLooksCost,
  isFreePlanAllowedModel,
} from "@/features/generation/lib/model-config";
import type { CreatorLooksMode } from "@/shared/generation/creator-looks-mode";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import type {
  UploadedImage,
  GeminiModel,
} from "@/features/generation/types";
import { DEFAULT_GENERATION_MODEL } from "@/features/generation/types";
import { InspireGenerationFlow } from "./InspireGenerationFlow";

/**
 * Creator Looks 詳細ページの Client Component (= 最小限の interactive 部分)
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md HG-002
 *   - 既存 InspirePageClient (= 4 つの override checkbox + count + model 選択) と異なり、
 *     Creator Looks は「衣装 + 背景の二択トグル」だけ消費者に見せる
 *   - 注釈で「カメラアングル / ポーズは変わらない (今後対応予定)」を明示 (REQ-018, モックアップ 03)
 *   - generationType=inspire で API に投げる (= 既存パイプラインに乗せる、ADR-002)
 *   - override_outfit=true / override_background=<チェック状態> / override_angle=false / override_pose=false
 *   - モデル選択 + ペルコイン消費量表示は Style/Inspire と同じ GenerationModelControls /
 *     GenerationSubmitButton を流用 (= UX 統一、Free plan upsell も同じ動線)
 *   - 生成枚数は 1 枚固定 (= Creator Looks は「着せ替えを 1 回試す」用途)
 */

interface CreatorLooksDetailClientProps {
  templateId: string;
  /**
   * Subscription plan (= Free plan で課金モデルを選んだ時に Upsell ダイアログを開くため)。
   * 未指定なら "free" 扱い (= fail-closed、課金モデル選択は upsell へ誘導)。
   */
  subscriptionPlan?: string;
  /**
   * 2段階(衣装＋背景)モードをこのユーザーに表示してよいか。
   * Server 側で公開レベル(admin_only/public)と admin 判定から解決して渡す。
   * false のときは「衣装のみ / 背景のみ」だけ表示する。
   */
  twoStageAvailable?: boolean;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const stripped = result.replace(/^data:[^;]+;base64,/, "");
      resolve(stripped);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CreatorLooksDetailClient({
  templateId,
  subscriptionPlan,
  twoStageAvailable = false,
}: CreatorLooksDetailClientProps) {
  const t = useTranslations("creatorLooksDetail");
  const { toast } = useToast();
  const router = useRouter();

  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [creatorLooksMode, setCreatorLooksMode] =
    useState<CreatorLooksMode>("outfit_only");
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    DEFAULT_GENERATION_MODEL,
  );
  const [isUpsellOpen, setIsUpsellOpen] = useState(false);

  const isFreePlan = subscriptionPlan === "free" || !subscriptionPlan;

  // 表示するモード(2段階は公開許可があるときだけ)。
  const modeOptions: Array<{
    mode: CreatorLooksMode;
    label: string;
    description: string;
  }> = [
    {
      mode: "outfit_only",
      label: t("modeOutfitOnlyLabel"),
      description: t("modeOutfitOnlyDescription"),
    },
    ...(twoStageAvailable
      ? [
          {
            mode: "outfit_and_background" as CreatorLooksMode,
            label: t("modeOutfitAndBackgroundLabel"),
            description: t("modeOutfitAndBackgroundDescription"),
          },
        ]
      : []),
    {
      mode: "background_only",
      label: t("modeBackgroundOnlyLabel"),
      description: t("modeBackgroundOnlyDescription"),
    },
  ];

  const totalPercoinCost = creatorLooksCost(selectedModel, creatorLooksMode);
  // Style / InspirePageClient と同じ: 「コーデ開始」押下直後 (= fetch 中で jobId 未取得) から
  // ステータスバーを表示するため、submitting または activeJobId のどちらかで InspireGenerationFlow を
  // マウントする。jobId が null の間は内部で「準備中」表示。
  const isGenerating = submitting || activeJobId !== null;

  const handleSubmit = async () => {
    if (!uploadedImage) {
      toast({ title: t("missingMyCharacter"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // 4.5MB の Vercel Serverless body 制限を回避するため、送信前にリサイズ/圧縮する
      // (= 既存 Style / Coordinate と同じ normalizeSourceImage を流用)
      const normalized = await normalizeSourceImage(uploadedImage.file);
      const base64 = await fileToBase64(normalized);
      const response = await fetch("/api/generate-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "creator-looks",
          generationType: "inspire",
          model: selectedModel,
          count: 1,
          styleTemplateId: templateId,
          sourceImageBase64: base64,
          sourceImageMimeType: normalized.type,
          // Creator Looks: 生成モードを送る(override_* は API 側でモードから導出)。
          creatorLooksMode,
        }),
      });
      if (response.status === 429) {
        const data = await response.json().catch(() => null);
        toast({
          title: data?.error ?? t("rateLimitedCooldown"),
          variant: "destructive",
        });
        return;
      }
      if (response.status === 422) {
        toast({ title: t("hiddenPromptNotReady"), variant: "destructive" });
        return;
      }
      if (!response.ok) {
        toast({ title: t("generateFailed"), variant: "destructive" });
        return;
      }
      const data = (await response.json()) as { jobId: string };
      setActiveJobId(data.jobId);
    } catch (e) {
      console.error("[creator-looks] generate failed", e);
      toast({ title: t("generateFailed"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = !uploadedImage || submitting || activeJobId !== null;

  return (
    <div className="space-y-6">
      {/* マイキャラ アップロード */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t("myCharacterLabel")}
        </Label>
        <p className="text-xs text-muted-foreground">{t("myCharacterHint")}</p>
        <ImageUploader
          onImageUpload={setUploadedImage}
          onImageRemove={() => setUploadedImage(null)}
          value={uploadedImage}
          disabled={submitting}
        />
      </div>

      {/* 生成モード選択 (= 衣装のみ / 衣装＋背景(2段階) / 背景のみ) */}
      <div className="space-y-2">
        <Label className="text-base font-medium">{t("modeLabel")}</Label>
        <RadioGroup
          value={creatorLooksMode}
          onValueChange={(v) => setCreatorLooksMode(v as CreatorLooksMode)}
          disabled={submitting}
          className="gap-2"
        >
          {modeOptions.map((opt) => {
            const cost = creatorLooksCost(selectedModel, opt.mode);
            const id = `creator-looks-mode-${opt.mode}`;
            const selected = creatorLooksMode === opt.mode;
            return (
              // label 内に RadioGroupItem(button) をネストすると invalid HTML になるため、
              // div をカード枠にして RadioGroupItem を外出しし、Label は text に htmlFor で紐付ける。
              // カード全体クリックでの選択は onClick で維持する。
              <div
                key={opt.mode}
                onClick={() => {
                  if (!submitting) setCreatorLooksMode(opt.mode);
                }}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <RadioGroupItem id={id} value={opt.mode} className="mt-0.5" />
                <Label
                  htmlFor={id}
                  className="min-w-0 flex-1 cursor-pointer space-y-1"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {t("modeCost", { cost })}
                    </span>
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {opt.description}
                  </span>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>

      {/* カメラアングル / ポーズ注釈 (= モックアップ 03 の小さい注釈) */}
      <p className="text-xs italic text-muted-foreground">
        {t("poseAngleNote")}
      </p>

      {/* モデル選択 + 生成 CTA (= Style / Inspire と同じ GenerationModelControls / SubmitButton) */}
      <Card className="p-6">
        <div className="space-y-6">
          <GenerationModelControls
            value={selectedModel}
            onChange={setSelectedModel}
            onLockedClick={() => {
              if (isFreePlan) {
                setIsUpsellOpen(true);
              }
            }}
            authState="authenticated"
            modelLabel={t("modelLabel")}
            disabled={submitting || activeJobId !== null}
            isModelSelectable={
              isFreePlan ? isFreePlanAllowedModel : undefined
            }
          />

          <GenerationSubmitButton
            onClick={handleSubmit}
            disabled={submitDisabled}
            isGenerating={submitting}
            generateLabel={t("tryThisLook")}
            generatingLabel={t("submitting")}
            costAmount={totalPercoinCost}
          />
        </div>
      </Card>

      {/*
        生成中フロー (= InspirePageClient と同パターン)。
        - 「コーデ開始」押下直後の fetch 中 (= submitting=true, activeJobId=null) からマウントし、
          内部で「準備中」表示 → jobId 取得後に polling 開始 → 完了で結果。
        - showResultPanel=false: 下の CachedGeneratedImageGallery が結果一覧表示するため二重表示回避。
        - onComplete で router.refresh() を呼び、Server Component な gallery を再 fetch して
          新しい生成画像を即時表示する。
      */}
      {isGenerating && (
        <InspireGenerationFlow
          jobId={activeJobId}
          aspectRatio={1}
          showResultPanel={false}
          copy={{
            statusFailed: t("generateFailed"),
            statusFailedDescription: t("generateFailedDescription"),
            resultsTitle: t("generationResultTitle"),
            resultsPlaceholder: "",
            resultImageAlt: t("generationResultAlt"),
          }}
          onComplete={() => {
            setActiveJobId(null);
            router.refresh();
          }}
        />
      )}

      {/* Free plan upsell ダイアログ (= 課金モデルを選択しようとした時に表示) */}
      <SubscriptionUpsellDialog
        open={isUpsellOpen}
        onOpenChange={setIsUpsellOpen}
      />
    </div>
  );
}

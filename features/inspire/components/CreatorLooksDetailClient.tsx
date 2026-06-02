"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImageUploader } from "@/features/generation/components/ImageUploader";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
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
 */

interface CreatorLooksDetailClientProps {
  templateId: string;
  /**
   * 将来モデル選択 UI を出すための情報。Stage 1 では未使用 (= 固定モデル)。
   * Phase 5 以降で MODEL 選択 UI を追加する際に活用予定。
   */
  subscriptionPlan?: string;
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
}: CreatorLooksDetailClientProps) {
  const t = useTranslations("creatorLooksDetail");
  const { toast } = useToast();

  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [backgroundEnabled, setBackgroundEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const selectedModel: GeminiModel = DEFAULT_GENERATION_MODEL;

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
          // Creator Looks: 衣装は必ず移植 / 背景はユーザー選択
          // アングル / ポーズは現状常に false (= 将来 UI で開放、計画 §A-4)
          overrides: {
            outfit: true,
            angle: false,
            pose: false,
            background: backgroundEnabled,
          },
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

      {/* 背景設定 (= モックアップ 03 / 既存 Style 画面 backgroundChange パターンを踏襲) */}
      <div className="space-y-2">
        <Label className="text-base font-medium">{t("backgroundLabel")}</Label>
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <Checkbox
            id="creator-looks-background"
            checked={backgroundEnabled}
            onCheckedChange={(v) => setBackgroundEnabled(v === true)}
            disabled={submitting}
            className="mt-0.5"
          />
          <div className="min-w-0 space-y-1">
            <Label
              htmlFor="creator-looks-background"
              className="cursor-pointer text-sm font-medium"
            >
              {t("backgroundCheckboxLabel")}
            </Label>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("backgroundCheckboxDescription")}
            </p>
          </div>
        </div>
      </div>

      {/* カメラアングル / ポーズ注釈 (= モックアップ 03 の小さい注釈) */}
      <p className="text-xs italic text-muted-foreground">
        {t("poseAngleNote")}
      </p>

      {/* Try this look CTA */}
      <div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleSubmit}
          disabled={submitDisabled}
        >
          {submitting ? t("submitting") : t("tryThisLook")}
        </Button>
      </div>

      {/* 生成中フロー (= 既存 InspireGenerationFlow 完全流用) */}
      {/* aspectRatio: モックアップ通り 1:1 を仮定 (= 詳細ページのテンプレ大画像が aspect-square) */}
      {/* showResultPanel=false: 下の CachedGeneratedImageGallery が結果を一覧表示するため二重表示を避ける */}
      {activeJobId && (
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
          onComplete={() => setActiveJobId(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ImageUploader } from "@/features/generation/components/ImageUploader";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";
import { ImageSourcePicker } from "@/features/generation/components/ImageSourcePicker/ImageSourcePicker";
import { ImageSourcePickerTrigger } from "@/features/generation/components/ImageSourcePickerTrigger";
import { useImageSourcePicker } from "@/features/generation/hooks/useImageSourcePicker";
import { GenerationModelControls } from "@/features/generation/components/GenerationModelControls";
import { GenerationSubmitButton } from "@/features/generation/components/GenerationSubmitButton";
import {
  getPercoinCost,
  isFreePlanAllowedModel,
} from "@/features/generation/lib/model-config";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import {
  DEFAULT_GENERATION_MODEL,
  type GeminiModel,
  type PickerSourceItem,
  type UploadedImage,
} from "@/features/generation/types";
import type { SourceImageStock } from "@/features/generation/lib/database";
import { InspireGenerationFlow } from "./InspireGenerationFlow";
import { InspireOverrideCheckbox } from "./InspireOverrideCheckbox";
import {
  hasAnyInspireOverride,
  type InspireOverrides,
} from "@/shared/generation/prompt-core";

type GeneratedPickerItem = Extract<PickerSourceItem, { kind: "generated" }>;

interface InspireTemplate {
  id: string;
  alt: string | null;
  image_url: string | null;
  submitted_by_user_id: string;
}

interface InspireSubmitter {
  nickname: string | null;
  avatar_url: string | null;
}

interface InspirePageClientCopy {
  formTitle: string;
  formDescription: string;
  formImageLabel: string;
  formCountLabel: string;
  formModelLabel: string;
  formGenerateButton: string;
  formGenerating: string;
  formImageRequired: string;
  formGenerationFailed: string;
  submittedByLabel: string;
  submitterAnonymous: string;
  submitterViewProfile: string;
  selectedTemplateLabel: string;
  formGenerateAria: string;
  formCharacterUploadHint: string;
  formUploadLabel: string;
  formAddImageAction: string;
  overrideLabel: string;
  overrideHint: string;
  overrideOutfit: string;
  overrideAngle: string;
  overridePose: string;
  overrideBackground: string;
  // 生成中ステータスは /coordinate と同じ coordinate namespace を使うため、
  // ここでは inspire 固有の「失敗」「結果」コピーのみ受け取る。
  statusFailed: string;
  statusFailedDescription: string;
  resultsTitle: string;
  resultsPlaceholder: string;
  resultImageAlt: string;
}

interface InspirePageClientProps {
  template: InspireTemplate;
  submitter: InspireSubmitter;
  copy: InspirePageClientCopy;
  subscriptionPlan: SubscriptionPlan;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function InspirePageClient({
  template,
  submitter,
  copy,
  subscriptionPlan,
}: InspirePageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isUpsellOpen, setIsUpsellOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 生成中（fetch 中 + ジョブ進行中）はフォームを操作不可にする。
  // polling 終了 (onComplete) で activeJobId を null に戻し再生成可能とする。
  const isGenerating = submitting || activeJobId !== null;
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  /**
   * ピッカーで「ストック / 生成済み」を選んだ場合、URL → File 化を行わず
   * id と preview URL だけ保持する。submit 時に sourceImageStockId /
   * sourceImageGeneratedId としてサーバへ送る (アップロード往復をスキップ)。
   */
  const [selectedRemoteSource, setSelectedRemoteSource] = useState<
    | { kind: "stock"; id: string; previewUrl: string; name?: string | null }
    | { kind: "generated"; id: string; previewUrl: string }
    | null
  >(null);
  const picker = useImageSourcePicker({ defaultTab: "generated" });
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    DEFAULT_GENERATION_MODEL
  );
  const [count, setCount] = useState<number>(1);
  // 「すべて維持」状態（4 つすべてチェック済み）で初期化。
  // 1 つもチェックがない場合は生成ボタン disabled（hasAnyInspireOverride で判定）。
  const [overrides, setOverrides] = useState<InspireOverrides>({
    outfit: true,
    angle: true,
    pose: true,
    background: true,
  });
  const [error, setError] = useState<string | null>(null);
  // テンプレ画像が読み込まれた時点で natural サイズから aspect ratio を計算する。
  // /style と同等の見た目にするため、ImageUploader にも同じ aspectRatio を渡す。
  const [templateAspectRatio, setTemplateAspectRatio] = useState<number>(1);
  const totalPercoinCost = getPercoinCost(selectedModel) * count;

  const handleSelectStock = (stock: SourceImageStock) => {
    setSelectedRemoteSource({
      kind: "stock",
      id: stock.id,
      previewUrl: stock.image_url,
      name: stock.name,
    });
    setUploadedImage(null);
    setError(null);
    picker.closePicker();
  };

  const handleSelectGenerated = (item: GeneratedPickerItem) => {
    setSelectedRemoteSource({
      kind: "generated",
      id: item.id,
      previewUrl: item.imageUrl,
    });
    setUploadedImage(null);
    setError(null);
    picker.closePicker();
  };

  const hasSourceImage =
    Boolean(uploadedImage) || Boolean(selectedRemoteSource);

  const handleGenerate = async (): Promise<void> => {
    if (!hasSourceImage) {
      setError(copy.formImageRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // ソース画像は 3 経路のうち 1 つ。stock/generated はサーバ側で id 経由
      // で image_url を解決するため、クライアントから Base64 を送らない。
      const requestBody: Record<string, unknown> = {
        prompt: "inspire",
        generationType: "inspire",
        model: selectedModel,
        count,
        styleTemplateId: template.id,
        overrides,
      };
      if (selectedRemoteSource?.kind === "stock") {
        requestBody.sourceImageStockId = selectedRemoteSource.id;
      } else if (selectedRemoteSource?.kind === "generated") {
        requestBody.sourceImageGeneratedId = selectedRemoteSource.id;
      } else if (uploadedImage) {
        // 4.5MB の Vercel Serverless body 制限を回避するため、送信前にリサイズ/圧縮する
        // (= 既存 Style / Coordinate と同じ normalizeSourceImage を流用)
        const normalized = await normalizeSourceImage(uploadedImage.file);
        const base64 = await fileToBase64(normalized);
        requestBody.sourceImageBase64 = base64;
        requestBody.sourceImageMimeType = normalized.type;
      }

      const response = await fetch("/api/generate-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        toast({ title: copy.formGenerationFailed, variant: "destructive" });
        return;
      }
      const data = (await response.json()) as { jobId: string };
      setActiveJobId(data.jobId);
    } catch (err) {
      console.error("[inspire] generate failed", err);
      toast({ title: copy.formGenerationFailed, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/*
        2-col grid (左: マイキャラ ImageUploader / 右: 選択中スタイル)。
        /style と完全に同じレイアウト・コンポーネント・aspect ratio。
      */}
      <section className="grid grid-cols-2 gap-3 md:gap-6">
        <div className="min-w-0 space-y-3">
          <ImageUploader
            onImageUpload={(image) => {
              setUploadedImage(image);
              setSelectedRemoteSource(null);
              setError(null);
            }}
            onImageRemove={() => {
              setUploadedImage(null);
              setSelectedRemoteSource(null);
            }}
            value={
              uploadedImage ??
              (selectedRemoteSource
                ? { previewUrl: selectedRemoteSource.previewUrl }
                : null)
            }
            label={copy.formUploadLabel}
            addImageLabel={copy.formAddImageAction}
            disabled={isGenerating}
            aspectRatio={templateAspectRatio}
            filledPreviewMode="natural"
          />
          <ImageSourcePickerTrigger
            onClick={picker.openPicker}
            disabled={isGenerating}
          />
        </div>

        <div className="min-w-0 space-y-3">
          <p className="text-base font-medium">
            {copy.selectedTemplateLabel}
          </p>
          <Card className="overflow-hidden p-0">
            <div
              className="relative bg-slate-100"
              style={{ aspectRatio: String(templateAspectRatio) }}
            >
              {template.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={template.image_url}
                  alt={template.alt ?? copy.selectedTemplateLabel}
                  className="absolute inset-0 h-full w-full object-cover"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      setTemplateAspectRatio(
                        img.naturalWidth / img.naturalHeight
                      );
                    }
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  no image
                </div>
              )}
            </div>
            {template.alt ? (
              <div className="border-t bg-white px-4 py-3">
                <p className="text-sm text-gray-700">{template.alt}</p>
              </div>
            ) : null}
          </Card>

          {/* 申請者カード（クリックでプロフィールへ） */}
          <Link
            href={`/users/${template.submitted_by_user_id}`}
            aria-label={copy.submitterViewProfile}
            className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Avatar className="size-10">
              {submitter.avatar_url ? (
                <AvatarImage src={submitter.avatar_url} alt="" />
              ) : null}
              <AvatarFallback>
                <UserIcon className="size-5" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                {copy.submittedByLabel}
              </p>
              <p className="truncate text-sm font-medium">
                {submitter.nickname ?? copy.submitterAnonymous}
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* image_1 から image_0 に適用したい要素（複数選択可）。 */}
      <Card className="p-6">
        <InspireOverrideCheckbox
          value={overrides}
          onChange={setOverrides}
          disabled={isGenerating}
          copy={{
            label: copy.overrideLabel,
            hint: copy.overrideHint,
            outfit: copy.overrideOutfit,
            angle: copy.overrideAngle,
            pose: copy.overridePose,
            background: copy.overrideBackground,
          }}
        />
      </Card>

      {/* モデル + 枚数 + 生成ボタン */}
      <Card className="p-6">
        <div className="space-y-6">
          <GenerationModelControls
            value={selectedModel}
            onChange={setSelectedModel}
            onLockedClick={() => {
              if (subscriptionPlan === "free") {
                setIsUpsellOpen(true);
              }
            }}
            authState="authenticated"
            modelLabel={copy.formModelLabel}
            disabled={isGenerating}
            isModelSelectable={
              subscriptionPlan === "free" ? isFreePlanAllowedModel : undefined
            }
          />

          <div className="space-y-3">
            <p className="text-base font-medium">{copy.formCountLabel}</p>
            <CountSelector
              value={count}
              onChange={setCount}
              disabled={isGenerating}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <GenerationSubmitButton
            onClick={handleGenerate}
            disabled={
              !hasSourceImage || isGenerating || !hasAnyInspireOverride(overrides)
            }
            isGenerating={isGenerating}
            generateLabel={copy.formGenerateButton}
            generatingLabel={copy.formGenerating}
            costAmount={totalPercoinCost}
            ariaLabel={copy.formGenerateAria}
          />
        </div>
      </Card>

      {/*
        /style と同じく「生成する」ボタン押下直後（fetch 中で jobId 未取得）から
        ステータスバーを表示するため、isGenerating の間ずっとマウントする。
        jobId が null の間は polling せず「準備中」表示のみになる。
      */}
      {isGenerating && (
        <InspireGenerationFlow
          jobId={activeJobId}
          aspectRatio={templateAspectRatio}
          onComplete={() => {
            // ジョブ完了で再度フォーム操作可能にし、router.refresh() で Gallery を更新。
            setActiveJobId(null);
            router.refresh();
          }}
          // 結果は下の CachedGeneratedImageGallery 側で表示するため、
          // ここでは進捗カード／失敗カードのみ描画して二重表示を避ける。
          showResultPanel={false}
          copy={{
            statusFailed: copy.statusFailed,
            statusFailedDescription: copy.statusFailedDescription,
            resultsTitle: copy.resultsTitle,
            resultsPlaceholder: copy.resultsPlaceholder,
            resultImageAlt: copy.resultImageAlt,
          }}
        />
      )}

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
        selectedStockId={
          selectedRemoteSource?.kind === "stock"
            ? selectedRemoteSource.id
            : null
        }
        disabled={isGenerating}
        currentPreviewUrl={
          selectedRemoteSource?.previewUrl ??
          uploadedImage?.previewUrl ??
          null
        }
      />
    </div>
  );
}

function CountSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[1, 2, 3, 4].map((n) => {
        const isSelected = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ImageInputMode,
  StylePresetAdmin,
  StylePresetStatus,
} from "@/features/style-presets/lib/schema";
import type { PresetCategoryAdmin } from "@/features/style-presets/lib/preset-category-repository";

interface StylePresetFormProps {
  preset?: StylePresetAdmin;
  categories: PresetCategoryAdmin[];
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
}

export function StylePresetForm({
  preset,
  categories,
  onSuccess,
  onCancel,
}: StylePresetFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(preset?.title ?? "");
  const [stylingPrompt, setStylingPrompt] = useState(
    preset?.stylingPrompt ?? ""
  );
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    preset?.backgroundPrompt ?? ""
  );
  const [sortOrder, setSortOrder] = useState(preset?.sortOrder ?? 0);
  const [status, setStatus] = useState<StylePresetStatus>(
    preset?.status ?? "draft"
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    preset?.thumbnailImageUrl ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 編集時は現在の category を維持。新規時は最初の active category を default にする。
  const editableCategories = useMemo(() => {
    // 編集時は現在の (inactive かもしれない) category も選択肢に維持する。
    // 新規時は active のみ。
    if (!preset) return categories.filter((c) => c.isActive);
    if (categories.some((c) => c.id === preset.category.id)) return categories;
    // 渡された一覧に存在しない場合 (まれ) は preset の category を補う
    return [
      ...categories,
      {
        id: preset.category.id,
        key: preset.category.key,
        displayNameJa: preset.category.displayNameJa,
        displayNameEn: preset.category.displayNameEn,
        badgeColor: preset.category.badgeColor,
        badgeTextColor: preset.category.badgeTextColor,
        skipBasePrefix: preset.category.skipBasePrefix,
        outputAspectRatioMode: preset.category.outputAspectRatioMode,
        userGuidanceJa: preset.category.userGuidanceJa,
        userGuidanceEn: preset.category.userGuidanceEn,
        showSourceImageTypeControl: preset.category.showSourceImageTypeControl,
        showBackgroundChangeControl: preset.category.showBackgroundChangeControl,
        showGenerationModelControl: preset.category.showGenerationModelControl,
        visibility: preset.category.visibility,
        defaultImageInputMode: "single" as const,
        displayOrder: 9999,
        isActive: preset.category.isActive,
        createdBy: null,
        updatedBy: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
  }, [categories, preset]);

  const initialCategoryId =
    preset?.category.id ??
    editableCategories.find((c) => c.isActive)?.id ??
    editableCategories[0]?.id ??
    "";

  const [categoryId, setCategoryId] = useState<string>(initialCategoryId);
  const [imageInputMode, setImageInputMode] = useState<ImageInputMode>(
    preset?.imageInputMode ??
      editableCategories.find((c) => c.id === initialCategoryId)
        ?.defaultImageInputMode ??
      "single",
  );
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(
    preset?.referenceImageUrl ?? null,
  );

  // category 切り替え時は default_image_input_mode を新しい値で上書き
  function handleCategoryChange(nextId: string) {
    setCategoryId(nextId);
    const cat = editableCategories.find((c) => c.id === nextId);
    if (cat) {
      setImageInputMode(cat.defaultImageInputMode);
    }
  }

  function handleReferenceFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    setReferenceFile(nextFile);
    setReferencePreviewUrl((previous) => {
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
      return URL.createObjectURL(nextFile);
    });
  }

  useEffect(() => {
    return () => {
      if (referencePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    setFile(nextFile);
    setPreviewUrl((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }

      return URL.createObjectURL(nextFile);
    });
  };

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim()) {
      toast({
        title: "エラー",
        description: "タイトルを入力してください",
        variant: "destructive",
      });
      return;
    }

    if (!stylingPrompt.trim()) {
      toast({
        title: "エラー",
        description: "styling prompt を入力してください",
        variant: "destructive",
      });
      return;
    }

    if (!preset && !file) {
      toast({
        title: "エラー",
        description: "サムネイル画像を選択してください",
        variant: "destructive",
      });
      return;
    }

    if (!categoryId) {
      toast({
        title: "エラー",
        description: "カテゴリを選択してください",
        variant: "destructive",
      });
      return;
    }

    if (imageInputMode === "dual") {
      const hasExistingReference = preset?.referenceImageStoragePath != null;
      if (!referenceFile && !hasExistingReference) {
        toast({
          title: "エラー",
          description:
            "dual モードでは参考画像 (image_1) のアップロードが必須です",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("styling_prompt", stylingPrompt);
      formData.append("background_prompt", backgroundPrompt);
      formData.append("sort_order", String(sortOrder));
      formData.append("status", status);
      formData.append("category_id", categoryId);
      formData.append("image_input_mode", imageInputMode);
      if (file) {
        formData.append("file", file);
      }
      if (referenceFile) {
        formData.append("reference_file", referenceFile);
      }

      const url = preset
        ? `/api/admin/style-presets/${preset.id}`
        : "/api/admin/style-presets";
      const method = preset ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error || "保存に失敗しました");
      }

      await onSuccess();
      toast({
        title: "保存しました",
        description: "スタイルを保存しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "保存に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="file">サムネイル画像（{preset ? "変更時のみ" : "必須"}）</Label>
          <div className="mt-2 space-y-3">
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative block overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              style={{ width: 112.5, height: 150 }}
              aria-label="サムネイル画像を選択"
            >
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={title || "サムネイル画像プレビュー"}
                    className="h-full w-full object-cover object-top"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    クリックして画像を変更
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-500">
                  <Upload className="h-6 w-6" aria-hidden />
                  <span className="text-xs font-medium leading-snug text-slate-700">
                    カードをクリックして画像を選択
                  </span>
                  <span className="text-[10px] leading-snug">
                    JPEG / PNG / WebP, 5MB 以下
                  </span>
                </div>
              )}
            </button>
            {file ? (
              <span className="block text-sm text-slate-600">{file.name}</span>
            ) : (
              <span className="block text-xs text-slate-500">
                {preset
                  ? "カードをクリックするとサムネイル画像を変更できます。"
                  : "カードをクリックするとサムネイル画像を選択できます。"}
              </span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="title">タイトル</Label>
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="SPRING SMART CASUAL"
            className="mt-1 min-h-[44px] text-base"
            required
          />
        </div>

        <div>
          <Label htmlFor="styling_prompt">Styling Prompt</Label>
          <Textarea
            id="styling_prompt"
            value={stylingPrompt}
            onChange={(event) => setStylingPrompt(event.target.value)}
            placeholder="Wearing Smart Casual style outfit..."
            className="mt-1 min-h-[220px] text-sm"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            衣装変更の指示として改行込みで保存され、そのまま生成処理に利用されます。
          </p>
        </div>

        <div>
          <Label htmlFor="background_prompt">Background Prompt（任意）</Label>
          <Textarea
            id="background_prompt"
            value={backgroundPrompt}
            onChange={(event) => setBackgroundPrompt(event.target.value)}
            placeholder="Soft spring city street with blossoms..."
            className="mt-1 min-h-[160px] text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            ユーザーが「背景もスタイルに合わせて変更する」を ON にした時だけ利用されます。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="category_id">カテゴリ</Label>
            <Select value={categoryId} onValueChange={handleCategoryChange}>
              <SelectTrigger id="category_id" className="mt-1 min-h-[44px]">
                <SelectValue placeholder="カテゴリを選択" />
              </SelectTrigger>
              <SelectContent>
                {editableCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.displayNameJa}
                    {cat.skipBasePrefix ? " (raw)" : ""}
                    {!cat.isActive ? " · inactive" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              raw カテゴリは共通プロンプトを付与しません。新規 admin/preset-categories で追加可能。
            </p>
          </div>
          <div>
            <Label htmlFor="image_input_mode">入力画像モード</Label>
            <Select
              value={imageInputMode}
              onValueChange={(value) =>
                setImageInputMode(value as ImageInputMode)
              }
            >
              <SelectTrigger id="image_input_mode" className="mt-1 min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">single (image_0 のみ)</SelectItem>
                <SelectItem value="dual">
                  dual (image_0 + 参考画像)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              category 切り替えで default が変わります。preset 単位で上書き可能。
            </p>
          </div>
        </div>

        {imageInputMode === "dual" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <Label htmlFor="reference_file" className="text-amber-900">
              参考画像 (image_1)
              {preset?.referenceImageStoragePath
                ? "（変更時のみ）"
                : "（必須）"}
            </Label>
            <div className="mt-2 space-y-2">
              <input
                ref={referenceFileInputRef}
                id="reference_file"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleReferenceFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => referenceFileInputRef.current?.click()}
                className="group relative block overflow-hidden rounded-lg border border-amber-300 bg-white text-left transition hover:border-amber-400"
                style={{ width: 112.5, height: 150 }}
                aria-label="参考画像を選択"
              >
                {referencePreviewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={referencePreviewUrl}
                      alt="参考画像プレビュー"
                      className="h-full w-full object-cover object-top"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      クリックして変更
                    </div>
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-amber-700">
                    <Upload className="h-6 w-6" aria-hidden />
                    <span className="text-xs font-medium leading-snug">
                      参考画像を選択
                    </span>
                    <span className="text-[10px] leading-snug">
                      JPEG / PNG / WebP, 5MB 以下
                    </span>
                  </div>
                )}
              </button>
              {referenceFile && (
                <span className="block text-sm text-amber-900">
                  {referenceFile.name}
                </span>
              )}
              <p className="text-xs text-amber-700">
                dual モードでは admin が登録した参考画像が image_1 として
                provider (OpenAI / Gemini) に毎回渡されます。ユーザーは preset を選ぶだけ。
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sort_order">表示順</Label>
            <Input
              id="sort_order"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(parseInt(event.target.value, 10) || 0)
              }
              className="mt-1 min-h-[44px] text-base"
            />
          </div>
          <div>
            <Label htmlFor="status">公開状態</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as StylePresetStatus)}
            >
              <SelectTrigger id="status" className="mt-1 min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">下書き</SelectItem>
                <SelectItem value="published">公開</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse justify-end gap-3 pt-4 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-[44px] w-full cursor-pointer sm:w-auto"
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px] w-full cursor-pointer sm:w-auto"
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          保存
        </Button>
      </div>
    </form>
  );
}

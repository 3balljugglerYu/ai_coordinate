"use client";

import { useEffect, useRef, useState } from "react";
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
  StylePresetAdmin,
  StylePresetStatus,
} from "@/features/style-presets/lib/schema";

interface StylePresetFormProps {
  preset?: StylePresetAdmin;
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
}

export function StylePresetForm({
  preset,
  onSuccess,
  onCancel,
}: StylePresetFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(preset?.title ?? "");
  const [prompt, setPrompt] = useState(preset?.prompt ?? "");
  const [sortOrder, setSortOrder] = useState(preset?.sortOrder ?? 0);
  const [status, setStatus] = useState<StylePresetStatus>(
    preset?.status ?? "draft"
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    preset?.thumbnailImageUrl ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (!prompt.trim()) {
      toast({
        title: "エラー",
        description: "prompt を入力してください",
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

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("prompt", prompt);
      formData.append("sort_order", String(sortOrder));
      formData.append("status", status);
      if (file) {
        formData.append("file", file);
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
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Wearing Smart Casual style outfit..."
            className="mt-1 min-h-[220px] text-sm"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            改行を含めて保存され、そのまま生成処理に利用されます。
          </p>
        </div>

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

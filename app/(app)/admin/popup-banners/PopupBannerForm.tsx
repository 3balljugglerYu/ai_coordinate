"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { PopupBannerPreview } from "./PopupBannerPreview";
import type { PopupBanner, PopupBannerStatus } from "@/features/popup-banners/lib/schema";

interface PopupBannerFormProps {
  banner?: PopupBanner;
  onSuccess: () => void;
  onCancel: () => void;
}

function toLocalDatetime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PopupBannerForm({
  banner,
  onSuccess,
  onCancel,
}: PopupBannerFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState(banner?.link_url ?? "");
  const [alt, setAlt] = useState(banner?.alt ?? "");
  const [displayStartAt, setDisplayStartAt] = useState(
    banner?.display_start_at ? toLocalDatetime(banner.display_start_at) : ""
  );
  const [displayEndAt, setDisplayEndAt] = useState(
    banner?.display_end_at ? toLocalDatetime(banner.display_end_at) : ""
  );
  const [displayOrder, setDisplayOrder] = useState(banner?.display_order ?? 0);
  const [status, setStatus] = useState<PopupBannerStatus>(
    banner?.status ?? "published"
  );
  const [showOnceOnly, setShowOnceOnly] = useState(
    banner?.show_once_only ?? false
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    banner?.image_url ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    setFile(nextFile);
    setPreviewUrl((previousUrl) => {
      if (previousUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previousUrl);
      }
      return URL.createObjectURL(nextFile);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!alt.trim()) {
      toast({
        title: "エラー",
        description: "altテキストを入力してください",
        variant: "destructive",
      });
      return;
    }

    if (!banner && !file) {
      toast({
        title: "エラー",
        description: "画像を選択してください",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("alt", alt.trim());
      formData.append("link_url", linkUrl.trim());
      formData.append(
        "display_start_at",
        displayStartAt ? new Date(displayStartAt).toISOString() : ""
      );
      formData.append(
        "display_end_at",
        displayEndAt ? new Date(displayEndAt).toISOString() : ""
      );
      formData.append("display_order", String(displayOrder));
      formData.append("status", status);
      formData.append("show_once_only", String(showOnceOnly));

      if (file) {
        formData.append("file", file);
      }

      const response = await fetch(
        banner ? `/api/admin/popup-banners/${banner.id}` : "/api/admin/popup-banners",
        {
          method: banner ? "PATCH" : "POST",
          body: formData,
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "保存に失敗しました");
      }

      toast({
        title: "保存しました",
        description: "ポップアップバナーを保存しました",
      });
      onSuccess();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "保存に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewBanner = previewUrl
    ? {
        imageUrl: previewUrl,
        alt: alt || "プレビュー",
        linkUrl: linkUrl.trim() || null,
        showOnceOnly,
      }
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="file">画像（{banner ? "変更時のみ" : "必須"}）</Label>
          <p className="mt-1 text-xs text-slate-500">
            3:4に近い縦長画像をアップロードしてください。JPEG / PNG / WebP、5MB以下。
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] w-full cursor-pointer sm:w-auto"
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              画像を選択
            </Button>
            {file && <span className="text-sm text-slate-600">{file.name}</span>}
          </div>
        </div>

        <div>
          <Label htmlFor="link_url">遷移先URL（任意）</Label>
          <Input
            id="link_url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="/challenge または https://..."
            className="mt-1 min-h-[44px] text-base"
          />
          <p className="mt-1 text-xs text-slate-500">
            空欄の場合は画像タップ時に遷移しません。
          </p>
        </div>

        <div>
          <Label htmlFor="alt">altテキスト</Label>
          <Input
            id="alt"
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="画像の説明"
            className="mt-1 min-h-[44px] text-base"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="display_start_at">表示開始日時（任意）</Label>
            <Input
              id="display_start_at"
              type="datetime-local"
              value={displayStartAt}
              onChange={(event) => setDisplayStartAt(event.target.value)}
              className="mt-1 min-h-[44px] text-base"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              お使いの端末のローカル時刻で指定します。
            </p>
          </div>
          <div>
            <Label htmlFor="display_end_at">表示終了日時（任意）</Label>
            <Input
              id="display_end_at"
              type="datetime-local"
              value={displayEndAt}
              onChange={(event) => setDisplayEndAt(event.target.value)}
              className="mt-1 min-h-[44px] text-base"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              お使いの端末のローカル時刻で指定します。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="display_order">表示優先順位</Label>
            <Input
              id="display_order"
              type="number"
              min={0}
              value={displayOrder}
              onChange={(event) =>
                setDisplayOrder(parseInt(event.target.value, 10) || 0)
              }
              className="mt-1 min-h-[44px] text-base"
            />
          </div>
          <div>
            <Label htmlFor="status">ステータス</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as PopupBannerStatus)}
            >
              <SelectTrigger id="status" className="mt-1 min-h-[44px] text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published">公開</SelectItem>
                <SelectItem value="draft">下書き</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="show_once_only"
              checked={showOnceOnly}
              onCheckedChange={(checked) => setShowOnceOnly(checked === true)}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="show_once_only" className="cursor-pointer text-sm">
                「次回から表示しない」を有効にする
              </Label>
              <p className="text-xs text-slate-500">
                ユーザーがチェックして閉じた場合、そのユーザーには以後表示しません。
              </p>
            </div>
          </div>
        </div>

        {previewBanner && (
          <div>
            <Label>プレビュー</Label>
            <div className="mt-2">
              <PopupBannerPreview banner={previewBanner} />
            </div>
          </div>
        )}
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
          {isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          保存
        </Button>
      </div>
    </form>
  );
}

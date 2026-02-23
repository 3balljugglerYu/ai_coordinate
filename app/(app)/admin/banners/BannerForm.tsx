"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
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
import { Loader2, Upload } from "lucide-react";
import { BannerPreview } from "./BannerPreview";
import type { Banner } from "@/features/banners/lib/schema";

interface BannerFormProps {
  banner?: Banner;
  onSuccess: () => void;
  onCancel: () => void;
}

export function BannerForm({
  banner,
  onSuccess,
  onCancel,
}: BannerFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState(banner?.link_url ?? "");
  const [alt, setAlt] = useState(banner?.alt ?? "");
  // DBはUTC、datetime-localはローカル時刻。表示時はUTC→ローカル変換
  const toLocalDatetime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [displayStartAt, setDisplayStartAt] = useState(
    banner?.display_start_at ? toLocalDatetime(banner.display_start_at) : ""
  );
  const [displayEndAt, setDisplayEndAt] = useState(
    banner?.display_end_at ? toLocalDatetime(banner.display_end_at) : ""
  );
  const [displayOrder, setDisplayOrder] = useState(
    banner?.display_order ?? 0
  );
  const [status, setStatus] = useState<"draft" | "published">(
    (banner?.status as "draft" | "published") ?? "published"
  );
  const [tags, setTags] = useState<string>(
    (banner?.tags ?? []).join(", ")
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    banner?.image_url ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      toast({
        title: "エラー",
        description: "遷移先URLを入力してください",
        variant: "destructive",
      });
      return;
    }
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
      formData.append("link_url", linkUrl.trim());
      formData.append("alt", alt.trim());
      // datetime-localはローカル時刻。送信時はUTC（ISO）に変換してDBに保存
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
      formData.append("tags", tags.trim());
      if (file) formData.append("file", file);

      const url = banner
        ? `/api/admin/banners/${banner.id}`
        : "/api/admin/banners";
      const method = banner ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");

      toast({ title: "保存しました", description: "バナーを保存しました" });
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
        id: banner?.id ?? "preview",
        imageUrl: previewUrl,
        linkUrl: linkUrl || "#",
        alt: alt || "プレビュー",
      }
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="file">画像（{banner ? "変更時のみ" : "必須"}）</Label>
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
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
              className="min-h-[44px] cursor-pointer"
            >
              <Upload className="h-4 w-4 mr-2" aria-hidden />
              画像を選択
            </Button>
            {file && (
              <span className="text-sm text-slate-600">{file.name}</span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="link_url">遷移先URL</Label>
          <Input
            id="link_url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="/challenge または https://..."
            className="mt-1 min-h-[44px] text-base"
            required
          />
        </div>

        <div>
          <Label htmlFor="alt">altテキスト</Label>
          <Input
            id="alt"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="画像の説明"
            className="mt-1 min-h-[44px] text-base"
            required
          />
        </div>

        <div>
          <Label htmlFor="tags">タグ（任意）</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="イベント, キャンペーン （カンマ区切り）"
            className="mt-1 min-h-[44px] text-base"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="display_start_at">表示開始日時（任意）</Label>
            <Input
              id="display_start_at"
              type="datetime-local"
              value={displayStartAt}
              onChange={(e) => setDisplayStartAt(e.target.value)}
              className="mt-1 min-h-[44px] text-base"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              お使いのデバイスの時刻（日本時間等）で指定
            </p>
          </div>
          <div>
            <Label htmlFor="display_end_at">表示終了日時（任意）</Label>
            <Input
              id="display_end_at"
              type="datetime-local"
              value={displayEndAt}
              onChange={(e) => setDisplayEndAt(e.target.value)}
              className="mt-1 min-h-[44px] text-base"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              お使いのデバイスの時刻（日本時間等）で指定
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="display_order">表示優先順位</Label>
            <Input
              id="display_order"
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
              className="mt-1 min-h-[44px] text-base"
            />
          </div>
          <div>
            <Label htmlFor="status">ステータス</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "draft" | "published")}
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

        {previewBanner && (
          <div>
            <Label>プレビュー</Label>
            <div className="mt-2">
              <BannerPreview banner={previewBanner} />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-[44px] w-full sm:w-auto cursor-pointer"
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px] w-full sm:w-auto cursor-pointer"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
          ) : null}
          保存
        </Button>
      </div>
    </form>
  );
}

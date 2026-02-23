"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload } from "lucide-react";
import type { MaterialPageImage } from "@/features/materials-images/lib/schema";

interface MaterialImageFormProps {
  slug: string;
  image?: MaterialPageImage;
  onSuccess: () => void;
  onCancel: () => void;
}

export function MaterialImageForm({
  slug,
  image,
  onSuccess,
  onCancel,
}: MaterialImageFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(image?.alt ?? "");
  const [displayOrder, setDisplayOrder] = useState(image?.display_order ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    image?.image_url ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(f);
      });
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alt.trim()) {
      toast({
        title: "エラー",
        description: "altテキストを入力してください",
        variant: "destructive",
      });
      return;
    }
    if (!image && !file) {
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
      formData.append("display_order", String(displayOrder));
      if (file) formData.append("file", file);

      const url = image
        ? `/api/admin/materials-images/${slug}/${image.id}`
        : `/api/admin/materials-images/${slug}`;
      const method = image ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");

      toast({ title: "保存しました", description: "画像を保存しました" });
      onSuccess();
    } catch (err) {
      toast({
        title: "エラー",
        description:
          err instanceof Error ? err.message : "保存に失敗しました",
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
          <Label htmlFor="file">画像（{image ? "変更時のみ" : "必須"}）</Label>
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
          <Label htmlFor="display_order">表示順</Label>
          <Input
            id="display_order"
            type="number"
            min={0}
            value={displayOrder}
            onChange={(e) =>
              setDisplayOrder(parseInt(e.target.value, 10) || 0)
            }
            className="mt-1 min-h-[44px] text-base"
          />
        </div>

        {previewUrl && (
          <div>
            <Label>プレビュー</Label>
            <div className="mt-2 relative h-32 w-48 overflow-hidden rounded-lg bg-slate-200/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={alt || "プレビュー"}
                className="h-full w-full object-cover"
              />
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

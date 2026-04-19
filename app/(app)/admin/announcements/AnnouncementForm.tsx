"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnnouncementEditor } from "@/features/announcements/components/AnnouncementEditor";
import type {
  AnnouncementAdmin,
  AnnouncementStatus,
} from "@/features/announcements/lib/schema";

interface AnnouncementFormProps {
  announcement?: AnnouncementAdmin;
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
}

function toLocalDatetime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AnnouncementForm({
  announcement,
  onSuccess,
  onCancel,
}: AnnouncementFormProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [status, setStatus] = useState<AnnouncementStatus>(
    announcement?.status ?? "draft"
  );
  const [publishAt, setPublishAt] = useState(
    announcement?.publishAt ? toLocalDatetime(announcement.publishAt) : ""
  );
  const [bodyJson, setBodyJson] = useState<unknown>(
    announcement?.bodyJson ?? undefined
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);
    try {
      const response = await fetch(
        announcement
          ? `/api/admin/announcements/${announcement.id}`
          : "/api/admin/announcements",
        {
          method: announcement ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            status,
            publishAt: publishAt ? new Date(publishAt).toISOString() : null,
            bodyJson,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "保存に失敗しました");
      }

      await onSuccess();
      toast({
        title: "保存しました",
        description: "お知らせを保存しました",
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
          <Label htmlFor="title">タイトル</Label>
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="重要なお知らせ"
            className="mt-1 min-h-[44px] text-base"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="status">公開状態</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as AnnouncementStatus)}
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

          <div>
            <Label htmlFor="publish_at">公開日時（任意）</Label>
            <Input
              id="publish_at"
              type="datetime-local"
              value={publishAt}
              onChange={(event) => setPublishAt(event.target.value)}
              className="mt-1 min-h-[44px] text-base"
            />
            <p className="mt-1 text-xs text-slate-500">
              公開を選び、未入力のまま保存すると即時公開されます。
            </p>
          </div>
        </div>

        <div>
          <Label>本文</Label>
          <p className="mt-1 text-xs text-slate-500">
            太字、文字サイズ、文字色、画像挿入に対応しています。
          </p>
          <div className="mt-2">
            <AnnouncementEditor value={bodyJson} onChange={setBodyJson} />
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
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              保存中...
            </>
          ) : announcement ? (
            "更新する"
          ) : (
            "作成する"
          )}
        </Button>
      </div>
    </form>
  );
}

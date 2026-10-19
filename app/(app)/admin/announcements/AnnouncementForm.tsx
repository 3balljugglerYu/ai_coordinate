"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  AnnouncementAdminView,
  AnnouncementStatus,
} from "@/features/announcements/lib/schema";
import {
  describeExpiredPushBroadcast,
  getPushBroadcastStatusLabel,
} from "@/features/push-broadcasts/lib/presentation";

interface AnnouncementFormProps {
  announcement?: AnnouncementAdminView;
  onSuccess: (announcement: AnnouncementAdminView) => void | Promise<void>;
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
  const existingPush = announcement?.push ?? null;
  // 送信が始まった・済んだ・期限切れの配信は戻せないので、チェックは変えられない
  const isPushLocked =
    existingPush?.status === "sending" ||
    existingPush?.status === "sent" ||
    existingPush?.status === "expired";
  const initialSendPush =
    existingPush !== null && existingPush.status !== "canceled";
  const [sendPush, setSendPush] = useState(initialSendPush);
  // 下書きのあいだはプッシュを予約できない（保存しても残らないので、選ばせない）
  const isDraft = status === "draft";
  const isPushCheckboxDisabled = isPushLocked || isDraft;
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
            // チェックを変えたときだけ送る。変えていなければサーバーが今の予約を保つ
            // （開いたままの古い画面の値で、取り消し・復活が黙って起きないように）。
            // 下書きはサーバーが予約を取り消すので、ここでは送らない
            ...(isPushCheckboxDisabled || sendPush === initialSendPush
              ? {}
              : { sendPush }),
            // 開いたときに見えていた配信の状態。保存までに送信が始まっていたら知らせてもらう
            ...(announcement ? { pushStatusSeen: existingPush?.status ?? null } : {}),
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | AnnouncementAdminView
        | { error?: string }
        | null;

      if (!response.ok) {
        const errorMessage =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "保存に失敗しました";

        throw new Error(errorMessage);
      }

      if (!payload || typeof payload !== "object" || !("id" in payload)) {
        throw new Error("保存に失敗しました");
      }

      await onSuccess(payload);
      if ("pushError" in payload && payload.pushError) {
        // 予約・変更・取り消しのどれが効かなかったかは pushError に書いてある
        toast({
          title: "プッシュ通知の設定を反映できませんでした",
          description: `お知らせは保存しました。${payload.pushError}`,
          variant: "destructive",
        });
        return;
      }
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

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="send_push"
              checked={isPushLocked ? true : isDraft ? false : sendPush}
              disabled={isPushCheckboxDisabled}
              onCheckedChange={(checked) => setSendPush(checked === true)}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="send_push" className="cursor-pointer text-sm">
                プッシュ通知も送る
              </Label>
              <p className="text-xs text-slate-500">
                公開日時にアプリへプッシュ通知を送ります（タイトルと本文の冒頭）。届くのは、アプリの通知設定で「運営からのお知らせ」をオンにしている人だけです（既定はオフ）。
              </p>
              {isDraft && !isPushLocked ? (
                <p className="text-xs text-amber-700">
                  下書きのあいだは選べません。公開にすると選べます
                  {existingPush?.status === "scheduled"
                    ? "（下書きで保存すると、予約中のプッシュ通知は取り消します）"
                    : ""}
                  。
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  下書きに戻す・チェックを外す・お知らせを削除すると、送る前なら予約も取り消します。
                </p>
              )}
              {existingPush && (
                <p className="text-xs text-slate-600">
                  プッシュ通知:{" "}
                  {
                    getPushBroadcastStatusLabel(
                      existingPush.status,
                      existingPush.pendingCount
                    ).label
                  }
                  {existingPush.status !== "scheduled" &&
                  existingPush.status !== "canceled"
                    ? `（宛先 ${existingPush.enqueuedCount} 人）`
                    : ""}
                </p>
              )}
              {existingPush?.status === "expired" && (
                <p className="text-xs text-rose-700">
                  {describeExpiredPushBroadcast(existingPush.enqueuedCount)}
                </p>
              )}
            </div>
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
          pending={isSubmitting}
          className="min-h-[44px] w-full cursor-pointer sm:w-auto"
        >
          {isSubmitting ? "保存中..." : announcement ? "更新する" : "作成する"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { Bell, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  PUSH_BROADCAST_BODY_MAX,
  PUSH_BROADCAST_TITLE_MAX,
  PUSH_BROADCAST_URL_MAX,
  isValidPushBroadcastUrl,
  type PushBroadcastAdminView,
} from "@/features/push-broadcasts/lib/schema";

interface PushBroadcastClientProps {
  initialBroadcasts: PushBroadcastAdminView[];
}

type SendMode = "now" | "schedule";

function readError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

export function PushBroadcastClient({
  initialBroadcasts,
}: PushBroadcastClientProps) {
  const { toast } = useToast();
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [sendAt, setSendAt] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const cancelTarget = useMemo(
    () => broadcasts.find((broadcast) => broadcast.id === cancelTargetId) ?? null,
    [broadcasts, cancelTargetId]
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/push-broadcasts");
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(readError(payload, "配信履歴の取得に失敗しました"));
      }
      setBroadcasts(payload as PushBroadcastAdminView[]);
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "配信履歴の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast]);

  const validate = () => {
    if (!title.trim()) {
      return "タイトルを入力してください";
    }
    const trimmedUrl = url.trim();
    if (trimmedUrl && !isValidPushBroadcastUrl(trimmedUrl)) {
      return "行き先は / から始まるパスか https:// の URL にしてください";
    }
    if (sendMode === "schedule") {
      if (!sendAt) {
        return "送信日時を入力してください";
      }
      if (new Date(sendAt).getTime() <= Date.now()) {
        return "送信日時は今より後にしてください";
      }
    }
    return null;
  };

  const handleOpenConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    const error = validate();
    if (error) {
      toast({ title: "エラー", description: error, variant: "destructive" });
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/push-broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || null,
          sendAt:
            sendMode === "schedule" && sendAt
              ? new Date(sendAt).toISOString()
              : null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !payload || typeof payload !== "object" || !("id" in payload)) {
        throw new Error(readError(payload, "配信の作成に失敗しました"));
      }

      setBroadcasts((current) => [payload as PushBroadcastAdminView, ...current]);
      setTitle("");
      setBody("");
      setUrl("");
      setSendMode("now");
      setSendAt("");
      setIsConfirmOpen(false);
      toast({
        title: sendMode === "now" ? "送信を始めました" : "予約しました",
        description:
          sendMode === "now"
            ? "数十秒で配信が始まります。状態は「更新」で確認できます。"
            : "送信日時になると配信が始まります。",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "配信の作成に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTargetId) {
      return;
    }
    setCancelingId(cancelTargetId);
    try {
      const response = await fetch(`/api/admin/push-broadcasts/${cancelTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !payload || typeof payload !== "object" || !("id" in payload)) {
        throw new Error(readError(payload, "取り消しに失敗しました"));
      }
      const canceled = payload as PushBroadcastAdminView;
      setBroadcasts((current) =>
        current.map((broadcast) =>
          broadcast.id === canceled.id ? { ...broadcast, ...canceled, stats: broadcast.stats } : broadcast
        )
      );
      setCancelTargetId(null);
      toast({ title: "取り消しました", description: "予約を取り消しました" });
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "取り消しに失敗しました",
        variant: "destructive",
      });
      // 送信が始まっていた等。最新の状態に合わせる
      void refresh();
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleOpenConfirm} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">新しい配信</h2>

        <div>
          <Label htmlFor="push_title">タイトル</Label>
          <Input
            id="push_title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={PUSH_BROADCAST_TITLE_MAX}
            placeholder="ハロウィン企画が始まりました"
            className="mt-1 min-h-[44px] text-base"
            required
          />
        </div>

        <div>
          <Label htmlFor="push_body">本文（任意）</Label>
          <Textarea
            id="push_body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={PUSH_BROADCAST_BODY_MAX}
            rows={3}
            placeholder="うちの子のベストショットを投稿しよう"
            className="mt-1 text-base"
          />
          <p className="mt-1 text-xs text-slate-500">
            端末によっては 1〜2 行で切れます。
          </p>
        </div>

        <div>
          <Label htmlFor="push_url">押したときの行き先（任意）</Label>
          <Input
            id="push_url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            maxLength={PUSH_BROADCAST_URL_MAX}
            placeholder="/style または https://persta.ai/..."
            className="mt-1 min-h-[44px] text-base"
          />
          <p className="mt-1 text-xs text-slate-500">
            / から始まるアプリ内のパスか https:// の URL。空ならアプリのホームを開きます。
          </p>
        </div>

        <div className="space-y-2">
          <Label>送るタイミング</Label>
          <RadioGroup
            value={sendMode}
            onValueChange={(value) => setSendMode(value as SendMode)}
            className="flex flex-col gap-3 sm:flex-row sm:gap-6"
          >
            <div className="flex min-h-[44px] items-center gap-2">
              <RadioGroupItem value="now" id="send_now" />
              <Label htmlFor="send_now" className="cursor-pointer font-normal">
                今すぐ送る
              </Label>
            </div>
            <div className="flex min-h-[44px] items-center gap-2">
              <RadioGroupItem value="schedule" id="send_schedule" />
              <Label htmlFor="send_schedule" className="cursor-pointer font-normal">
                日時を指定して予約する
              </Label>
            </div>
          </RadioGroup>
          {sendMode === "schedule" && (
            <Input
              id="push_send_at"
              type="datetime-local"
              value={sendAt}
              onChange={(event) => setSendAt(event.target.value)}
              className="min-h-[44px] text-base sm:max-w-xs"
            />
          )}
        </div>

        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          届くのは、アプリの通知設定で「運営からのお知らせ」をオンにしている人だけです（既定はオフ）。
          通知を止める時間帯・一時停止中の人には送りません。送信が始まった配信は取り消せません。
        </p>

        <div className="flex justify-end">
          <Button
            type="submit"
            className="min-h-[44px] w-full cursor-pointer sm:w-auto"
          >
            <Bell className="mr-2 h-4 w-4" aria-hidden />
            {sendMode === "now" ? "送信する" : "予約する"}
          </Button>
        </div>
      </form>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">配信履歴</h2>
            <p className="text-sm text-slate-500">
              新しい順に {broadcasts.length} 件。送信数は 7 日たつと 0 に戻ります。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refresh()}
            pending={isRefreshing}
            className="min-h-[44px] cursor-pointer"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            更新
          </Button>
        </div>

        {broadcasts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
            <p className="mt-3 text-sm text-slate-600">
              まだ配信はありません。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((broadcast) => (
              <div
                key={broadcast.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={broadcast.statusClassName}>
                        {broadcast.statusLabel}
                      </Badge>
                      {broadcast.announcementId && (
                        <Badge
                          variant="outline"
                          className="border-slate-300 text-slate-600"
                        >
                          運営お知らせ
                        </Badge>
                      )}
                      <span className="text-xs text-slate-500">
                        送信日時: {broadcast.sendAtDisplay}
                      </span>
                    </div>
                    <h3 className="truncate text-base font-semibold text-slate-900">
                      {broadcast.title}
                    </h3>
                    {broadcast.body && (
                      <p className="line-clamp-2 text-sm text-slate-600">
                        {broadcast.body}
                      </p>
                    )}
                    {broadcast.url && (
                      <p className="truncate text-xs text-slate-500">
                        行き先: {broadcast.url}
                      </p>
                    )}
                    {(broadcast.status === "sending" ||
                      broadcast.status === "sent") && (
                      <p className="text-xs text-slate-600">
                        宛先 {broadcast.enqueuedCount} 人 ／ 送信 {broadcast.stats.sent}
                        ・送らず {broadcast.stats.skipped}・失敗 {broadcast.stats.failed}
                        ・待ち {broadcast.stats.pending}
                      </p>
                    )}
                  </div>

                  {broadcast.status === "scheduled" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCancelTargetId(broadcast.id)}
                      className="min-h-[44px] shrink-0 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      取り消す
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sendMode === "now" ? "今すぐ送信しますか？" : "予約しますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              「{title.trim()}」を、「運営からのお知らせ」をオンにしているアプリの利用者へ送ります。
              {sendMode === "now"
                ? "送信が始まると取り消せません。"
                : "送信日時になるまでは取り消せます。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  送信中...
                </>
              ) : sendMode === "now" ? (
                "送信する"
              ) : (
                "予約する"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(cancelTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTargetId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予約を取り消しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.title
                ? `「${cancelTarget.title}」の配信を取り消します。`
                : "この配信を取り消します。"}
              {cancelTarget?.announcementId
                ? "お知らせ自体は公開されたままです。"
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(cancelingId)}>
              戻る
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleCancel();
              }}
              disabled={Boolean(cancelingId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  取り消し中...
                </>
              ) : (
                "取り消す"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

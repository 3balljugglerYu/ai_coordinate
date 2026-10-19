"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import type { AnnouncementAdminView } from "@/features/announcements/lib/schema";
import { getPushBroadcastStatusLabel } from "@/features/push-broadcasts/lib/presentation";
import { AnnouncementForm } from "./AnnouncementForm";

interface AnnouncementListClientProps {
  initialAnnouncements: AnnouncementAdminView[];
}

function sortAnnouncements(items: AnnouncementAdminView[]) {
  return [...items].sort((a, b) => {
    if (a.publishAt && b.publishAt) {
      const publishDiff =
        new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();

      if (publishDiff !== 0) {
        return publishDiff;
      }
    } else if (a.publishAt || b.publishAt) {
      return a.publishAt ? -1 : 1;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function AnnouncementListClient({
  initialAnnouncements,
}: AnnouncementListClientProps) {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState(() =>
    sortAnnouncements(initialAnnouncements)
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<AnnouncementAdminView | null>(null);
  // 編集を開くときは今の状態を読み直す（一覧はページを開いた時のままなので、
  // ほかの画面でプッシュを取り消した等が反映されていない）
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 開いた順の番号。すばやく開き直したとき、前の読み込みの結果で上書きしない
  const editRequestRef = useRef(0);
  const openEdit = useCallback(async (announcement: AnnouncementAdminView) => {
    const requestId = ++editRequestRef.current;
    setEditingAnnouncement(announcement);
    setIsLoadingEdit(true);
    try {
      const response = await fetch(`/api/admin/announcements/${announcement.id}`, {
        cache: "no-store",
      });
      const fetched = (await response.json().catch(() => null)) as
        | AnnouncementAdminView
        | null;
      if (requestId !== editRequestRef.current) {
        return;
      }
      if (response.status === 404) {
        // ほかのタブで消されていた。古い内容で開いて、全部直してから保存で失敗させない
        setEditingAnnouncement(null);
        setAnnouncements((current) =>
          current.filter((item) => item.id !== announcement.id)
        );
        toast({
          title: "このお知らせは削除されています",
          description: "一覧から外しました",
          variant: "destructive",
        });
        return;
      }
      if (!response.ok || !fetched || typeof fetched !== "object" || !("id" in fetched)) {
        toast({
          title: "最新の状態を読めませんでした",
          description: "一覧に出ている内容で開きます。保存の前に、ほかで変えていないか確かめてください",
          variant: "destructive",
        });
        return;
      }
      {
        // 配信の行はお知らせを消すまで無くならない。読み直しで push が null なら
        // 状態を読めなかっただけなので、一覧の値を残す（送信済みを「無い」と見せない）
        const fresh =
          fetched.push === null && announcement.push !== null
            ? { ...fetched, push: announcement.push }
            : fetched;
        setEditingAnnouncement(fresh);
        setAnnouncements((current) =>
          sortAnnouncements(
            current.map((item) => (item.id === fresh.id ? fresh : item))
          )
        );
      }
    } catch (error) {
      // 読めなければ一覧の値で開く（チェックを変えない限りプッシュは変わらない）
      console.error("[Admin Announcements] reload before edit error:", error);
      if (requestId === editRequestRef.current) {
        toast({
          title: "最新の状態を読めませんでした",
          description: "一覧に出ている内容で開きます。保存の前に、ほかで変えていないか確かめてください",
          variant: "destructive",
        });
      }
    } finally {
      if (requestId === editRequestRef.current) {
        setIsLoadingEdit(false);
      }
    }
  }, [toast]);

  const deletingAnnouncement = useMemo(
    () =>
      announcements.find((announcement) => announcement.id === deleteConfirmId) ??
      null,
    [announcements, deleteConfirmId]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmId) {
      return;
    }

    setDeletingId(deleteConfirmId);
    try {
      const response = await fetch(`/api/admin/announcements/${deleteConfirmId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "削除に失敗しました");
      }

      setAnnouncements((current) =>
        current.filter((announcement) => announcement.id !== deleteConfirmId)
      );
      setDeleteConfirmId(null);
      toast({
        title: "削除しました",
        description: "お知らせを削除しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirmId, toast]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">一覧</h2>
          <p className="text-sm text-slate-500">
            作成、編集、削除、公開予約ができます。
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[44px] cursor-pointer"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          新規作成
        </Button>
      </div>

      {announcements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-3 text-sm text-slate-600">
            まだお知らせはありません。新規作成から追加できます。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => {
            return (
              <div
                key={announcement.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={announcement.displayStatusClassName}>
                        {announcement.displayStatusLabel}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        公開日時: {announcement.publishAtDisplay}
                      </span>
                      {announcement.push && (
                        <Badge
                          variant="outline"
                          className="border-slate-300 text-slate-600"
                        >
                          プッシュ:{" "}
                          {
                            getPushBroadcastStatusLabel(
                              announcement.push.status,
                              announcement.push.pendingCount
                            ).label
                          }
                        </Badge>
                      )}
                    </div>
                    <h3 className="truncate text-base font-semibold text-slate-900">
                      {announcement.title}
                    </h3>
                    <p className="line-clamp-3 text-sm text-slate-600">
                      {announcement.bodyText || "本文なし"}
                    </p>
                  </div>

                  <div className="flex shrink-0 sm:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] cursor-pointer"
                          aria-label="操作メニュー"
                        >
                          <MoreVertical className="h-5 w-5" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => void openEdit(announcement)}
                        >
                          <Pencil className="mr-2 h-4 w-4" aria-hidden />
                          編集
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteConfirmId(announcement.id)}
                          className="text-red-600 focus:text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                          削除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="hidden shrink-0 gap-2 sm:flex">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void openEdit(announcement)}
                      className="min-h-[44px] min-w-[44px] cursor-pointer"
                      aria-label="編集"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setDeleteConfirmId(announcement.id)}
                      className="min-h-[44px] min-w-[44px] cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label="削除"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90svh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>お知らせを作成</DialogTitle>
          </DialogHeader>
          <AnnouncementForm
            onSuccess={(savedAnnouncement) => {
              setAnnouncements((current) =>
                sortAnnouncements([savedAnnouncement, ...current])
              );
              setIsCreateOpen(false);
            }}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingAnnouncement)}
        onOpenChange={(open) => {
          if (!open) {
            editRequestRef.current += 1;
            setEditingAnnouncement(null);
            setIsLoadingEdit(false);
          }
        }}
      >
        <DialogContent className="max-h-[90svh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>お知らせを編集</DialogTitle>
          </DialogHeader>
          {editingAnnouncement && isLoadingEdit && (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              読み込み中…
            </div>
          )}
          {editingAnnouncement && !isLoadingEdit && (
            <AnnouncementForm
              key={`${editingAnnouncement.id}:${editingAnnouncement.updatedAt}:${editingAnnouncement.push?.status ?? "none"}`}
              announcement={editingAnnouncement}
              onSuccess={(savedAnnouncement) => {
                setAnnouncements((current) =>
                  sortAnnouncements(
                    current.map((announcement) =>
                      announcement.id === savedAnnouncement.id
                        ? {
                            ...savedAnnouncement,
                            // 保存の結果で配信の状態を読めなかった（null）ときは前の値を残す
                            // （配信の行はお知らせを消すまで無くならない）
                            push: savedAnnouncement.push ?? announcement.push,
                          }
                        : announcement
                    )
                  )
                );
                setEditingAnnouncement(null);
              }}
              onCancel={() => setEditingAnnouncement(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteConfirmId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>お知らせを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAnnouncement?.title
                ? `「${deletingAnnouncement.title}」を削除します。この操作は取り消せません。`
                : "この操作は取り消せません。"}
              {deletingAnnouncement?.push
                ? deletingAnnouncement.push.status === "scheduled"
                  ? "予約中のプッシュ通知も取り消します。"
                  : "プッシュ通知の配信の記録も一緒に消えます（操作ログには残します）。"
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={Boolean(deletingId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  削除中...
                </>
              ) : (
                "削除する"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

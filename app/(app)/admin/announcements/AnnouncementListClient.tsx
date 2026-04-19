"use client";

import { useCallback, useMemo, useState } from "react";
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
                          onClick={() => setEditingAnnouncement(announcement)}
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
                      onClick={() => setEditingAnnouncement(announcement)}
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
        <DialogContent className="h-[90dvh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto sm:h-auto sm:max-h-[90vh]">
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
            setEditingAnnouncement(null);
          }
        }}
      >
        <DialogContent className="h-[90dvh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto sm:h-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>お知らせを編集</DialogTitle>
          </DialogHeader>
          {editingAnnouncement && (
            <AnnouncementForm
              announcement={editingAnnouncement}
              onSuccess={(savedAnnouncement) => {
                setAnnouncements((current) =>
                  sortAnnouncements(
                    current.map((announcement) =>
                      announcement.id === savedAnnouncement.id
                        ? savedAnnouncement
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

"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

type ModerationStatus =
  | "draft"
  | "pending"
  | "visible"
  | "removed"
  | "withdrawn";

interface MySubmittedTemplate {
  id: string;
  alt: string | null;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  moderation_updated_at: string | null;
  created_at: string;
  image_url: string | null;
}

interface Copy {
  title: string;
  description: string;
  submitButton: string;
  emptyState: string;
  statusDraft: string;
  statusPending: string;
  statusVisible: string;
  statusRemoved: string;
  statusWithdrawn: string;
  withdrawAction: string;
  withdrawConfirmTitle: string;
  withdrawConfirmDescriptionDraft: string;
  withdrawConfirmDescriptionActive: string;
  withdrawConfirmAction: string;
  withdrawCancelAction: string;
  withdrawSuccess: string;
  withdrawFailed: string;
  resubmitAction: string;
  deleteAction: string;
  deleteConfirmTitle: string;
  deleteConfirmDescription: string;
  deleteConfirmAction: string;
  deleteSuccess: string;
  deleteFailed: string;
}

interface MySubmittedTemplatesCardClientProps {
  items: MySubmittedTemplate[];
  copy: Copy;
}

export function MySubmittedTemplatesCardClient({
  items,
  copy,
}: MySubmittedTemplatesCardClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingWithdraw, setPendingWithdraw] =
    useState<MySubmittedTemplate | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  // 完全削除（removed/withdrawn のレコード）の確認 + 実行用 state
  const [pendingDelete, setPendingDelete] =
    useState<MySubmittedTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusLabel = useCallback(
    (status: ModerationStatus): string => {
      switch (status) {
        case "draft":
          return copy.statusDraft;
        case "pending":
          return copy.statusPending;
        case "visible":
          return copy.statusVisible;
        case "removed":
          return copy.statusRemoved;
        case "withdrawn":
          return copy.statusWithdrawn;
      }
    },
    [copy]
  );

  const statusVariant = useCallback(
    (status: ModerationStatus): "default" | "secondary" | "outline" => {
      if (status === "visible") return "default";
      if (status === "pending") return "secondary";
      return "outline";
    },
    []
  );

  const handleWithdraw = useCallback(async () => {
    if (!pendingWithdraw) return;
    setWithdrawing(true);
    try {
      const response = await fetch(
        `/api/style-templates/submissions/${pendingWithdraw.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        toast({
          title: copy.withdrawFailed,
          variant: "destructive",
        });
        return;
      }
      toast({ title: copy.withdrawSuccess });
      setPendingWithdraw(null);
      router.refresh();
    } finally {
      setWithdrawing(false);
    }
  }, [copy, pendingWithdraw, router, toast]);

  // removed / withdrawn のレコードを完全削除する。API DELETE は state によって
  // 完全削除 / 取り下げを切り替えるため呼び出しは同じエンドポイント。
  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/style-templates/submissions/${pendingDelete.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        toast({
          title: copy.deleteFailed,
          variant: "destructive",
        });
        return;
      }
      toast({ title: copy.deleteSuccess });
      setPendingDelete(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }, [copy, pendingDelete, router, toast]);

  // 取り下げボタン: draft / pending / visible
  const canWithdraw = (status: ModerationStatus) =>
    status === "draft" || status === "pending" || status === "visible";

  // 再申請 / 削除ボタン: removed / withdrawn
  const canResubmitOrDelete = (status: ModerationStatus) =>
    status === "removed" || status === "withdrawn";

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{copy.title}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <Button asChild>
          <Link href="/inspire/submit">{copy.submitButton}</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {copy.emptyState}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-md border bg-card"
            >
              <div className="flex aspect-square items-center justify-center bg-muted">
                {item.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.image_url}
                    alt={item.alt ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    no image
                  </span>
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={statusVariant(item.moderation_status)}>
                    {statusLabel(item.moderation_status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.created_at.slice(0, 10)}
                  </span>
                </div>
                {item.alt && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {item.alt}
                  </p>
                )}
                {item.moderation_reason &&
                  (item.moderation_status === "removed" ||
                    item.moderation_status === "withdrawn") && (
                    <p className="line-clamp-2 text-xs text-destructive">
                      {item.moderation_reason}
                    </p>
                  )}
                {canWithdraw(item.moderation_status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingWithdraw(item)}
                    className="w-full"
                  >
                    {copy.withdrawAction}
                  </Button>
                )}
                {canResubmitOrDelete(item.moderation_status) && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button asChild variant="outline" size="sm">
                      {/* 再申請: submit 成功時にこの行（古い rejected/withdrawn）を
                          上書き削除するため、`?replace=<id>` でページに渡す */}
                      <Link
                        href={`/inspire/submit?replace=${encodeURIComponent(item.id)}`}
                      >
                        {copy.resubmitAction}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(item)}
                      className="text-destructive hover:text-destructive"
                    >
                      {copy.deleteAction}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={pendingWithdraw !== null}
        onOpenChange={(next) => {
          if (!next) setPendingWithdraw(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.withdrawConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingWithdraw?.moderation_status === "draft"
                ? copy.withdrawConfirmDescriptionDraft
                : copy.withdrawConfirmDescriptionActive}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawing}>
              {copy.withdrawCancelAction}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWithdraw}
              disabled={withdrawing}
            >
              {copy.withdrawConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 完全削除確認（removed / withdrawn のレコード） */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.deleteConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {copy.withdrawCancelAction}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {copy.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

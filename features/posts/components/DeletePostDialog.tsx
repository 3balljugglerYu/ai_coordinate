"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deletePost } from "../lib/api";
import { deleteMyImage } from "@/features/my-page/lib/api";
import { persistPendingHomePostRefresh } from "../lib/home-post-refresh";

interface DeletePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  imageUrl?: string;
  isPosted?: boolean; // 投稿済みかどうか
}

export function DeletePostDialog({
  open,
  onOpenChange,
  imageId,
  imageUrl,
  isPosted = true,
}: DeletePostDialogProps) {
  const postsT = useTranslations("posts");
  const myPageT = useTranslations("myPage");
  const searchParams = useSearchParams();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);

    try {
      if (isPosted) {
        // 投稿済みの場合は投稿を取り消す
        await deletePost(imageId, {
          deleteFailed: postsT("deleteFailed"),
        });
      } else {
        // 未投稿の場合は完全削除
        await deleteMyImage(imageId, {
          loginRequired: myPageT("loginRequired"),
          imageNotFound: myPageT("imageNotFound"),
          deleteImageForbidden: myPageT("deleteImageForbidden"),
          deleteImageFailed: myPageT("deleteImageFailed"),
        });
      }
      onOpenChange(false);

      // 遷移元を確認して戻る先を決定
      const fromParam = searchParams.get("from");
      const backUrl = fromParam === "my-page" ? "/my-page" : "/";

      if (backUrl === "/") {
        // ホームへ遷移する場合、キャッシュ無効化後にフルリロードで確実に最新表示
        if (isPosted) {
          persistPendingHomePostRefresh({
            action: "unposted",
            postId: imageId,
          });
        }
        try {
          await fetch("/api/revalidate/home", { method: "POST" });
        } catch {
          // 無効化失敗時も遷移は実行
        }
        window.location.href = "/";
      } else {
        try {
          await fetch("/api/revalidate/my-page", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ imageId }),
          });
        } catch {
          // 無効化失敗時も遷移は実行
        }
        window.location.href = backUrl;
      }
    } catch (err) {
      console.error("Delete error:", err);
      setError(
        err instanceof Error
          ? err.message
          : isPosted
          ? postsT("deleteFailedRetry")
          : myPageT("deleteImageFailed")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isPosted
              ? postsT("deleteDialogUnpostTitle")
              : postsT("deleteDialogDeleteTitle")}
          </DialogTitle>
          <DialogDescription>
            {isPosted
              ? postsT("deleteDialogUnpostDescription")
              : postsT("deleteDialogDeleteDescription")}
          </DialogDescription>
        </DialogHeader>

        {imageUrl && (
          <div className="mt-4">
            <img
              src={imageUrl}
              alt={postsT("deleteDialogImageAlt")}
              className="max-h-48 w-full rounded object-cover"
            />
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {postsT("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? isPosted
                ? postsT("deleteDialogUnposting")
                : postsT("deleteDialogDeleting")
              : isPosted
                ? postsT("unpost")
                : postsT("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

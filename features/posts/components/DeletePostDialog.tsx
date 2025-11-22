"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);

    try {
      if (isPosted) {
        // 投稿済みの場合は投稿を取り消す
        await deletePost(imageId);
      } else {
        // 未投稿の場合は完全削除
        await deleteMyImage(imageId);
      }
      onOpenChange(false);
      
      // 遷移元を確認して戻る先を決定
      const fromParam = searchParams.get("from");
      const backUrl = fromParam === "my-page" ? "/my-page" : "/";
      router.push(backUrl);
      router.refresh();
    } catch (err) {
      console.error("Delete error:", err);
      setError(
        err instanceof Error
          ? err.message
          : isPosted
          ? "投稿の取り消しに失敗しました。もう一度お試しください。"
          : "削除に失敗しました。もう一度お試しください。"
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
            {isPosted ? "投稿を取り消す" : "画像を削除"}
          </DialogTitle>
          <DialogDescription>
            {isPosted
              ? "この投稿を投稿一覧から取り消しますか？画像はマイページに残ります。完全に削除する場合は、マイページから削除してください。"
              : "この画像を完全に削除しますか？この操作は取り消せません。"}
          </DialogDescription>
        </DialogHeader>

        {imageUrl && (
          <div className="mt-4">
            <img
              src={imageUrl}
              alt="削除対象の画像"
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
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? isPosted
                ? "取り消し中..."
                : "削除中..."
              : isPosted
              ? "取り消す"
              : "削除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


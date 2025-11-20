"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

interface DeletePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  imageUrl?: string;
}

export function DeletePostDialog({
  open,
  onOpenChange,
  imageId,
  imageUrl,
}: DeletePostDialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);

    try {
      await deletePost(imageId);
      onOpenChange(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Delete error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "投稿の取り消しに失敗しました。もう一度お試しください。"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>投稿を取り消す</DialogTitle>
          <DialogDescription>
            この投稿を投稿一覧から取り消しますか？画像はマイページに残ります。完全に削除する場合は、マイページから削除してください。
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
            {isDeleting ? "取り消し中..." : "取り消す"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


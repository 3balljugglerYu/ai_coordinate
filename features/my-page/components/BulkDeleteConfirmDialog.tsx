"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BulkDeleteConfirmDialogProps {
  open: boolean;
  count: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BulkDeleteConfirmDialog({
  open,
  count,
  isDeleting,
  onConfirm,
  onCancel,
}: BulkDeleteConfirmDialogProps) {
  const t = useTranslations("myPage");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 削除中はキャンセル不可（リクエスト最中の race を避ける）
        if (!next && !isDeleting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("bulkDeleteConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("bulkDeleteConfirmDescription", { count })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {t("bulkDeleteCancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? t("bulkDeleteInProgress")
              : t("bulkDeleteConfirmAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

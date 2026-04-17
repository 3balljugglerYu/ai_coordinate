"use client";

import { LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface SubscriptionImmediateChangeFinalDialogProps {
  open: boolean;
  processing: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionImmediateChangeFinalDialog({
  open,
  processing,
  onConfirm,
  onOpenChange,
}: SubscriptionImmediateChangeFinalDialogProps) {
  const t = useTranslations("subscription");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changeFinalConfirmationTitle")}</DialogTitle>
          <DialogDescription>
            {t("changeFinalConfirmationDescription")}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {t("changeFinalConfirmationCancelAction")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={processing}>
            {processing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            {t("changeFinalConfirmationConfirmAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

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
import { SubscriptionPortalButton } from "@/features/subscription/components/SubscriptionPortalButton";

interface SubscriptionChangeFailureDialogProps {
  open: boolean;
  message: string | null;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionChangeFailureDialog({
  open,
  message,
  onOpenChange,
}: SubscriptionChangeFailureDialogProps) {
  const t = useTranslations("subscription");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changePaymentFailureDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("changePaymentFailureDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {message ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {message}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("changePaymentFailureCloseAction")}
          </Button>
          <SubscriptionPortalButton
            size="default"
            variant="default"
            label={t("changePaymentFailureManageAction")}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

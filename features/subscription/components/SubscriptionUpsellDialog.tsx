"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";

interface SubscriptionUpsellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionUpsellDialog({
  open,
  onOpenChange,
}: SubscriptionUpsellDialogProps) {
  const t = useTranslations("subscription");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t("upsellTitle")}
          </DialogTitle>
          <DialogDescription>{t("upsellDescription")}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("laterAction")}
          </Button>
          <Button asChild>
            <Link href={`${ROUTES.CREDITS_PURCHASE}?tab=subscription`}>
              {t("seePlansAction")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

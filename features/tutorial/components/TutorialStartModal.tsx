"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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

interface TutorialStartModalProps {
  open: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

export function TutorialStartModal({
  open,
  onConfirm,
  onDecline,
}: TutorialStartModalProps) {
  const [showDeclinedMessage, setShowDeclinedMessage] = useState(false);
  const t = useTranslations("tutorial");

  useEffect(() => {
    if (!open) setShowDeclinedMessage(false);
  }, [open]);

  const handleDeclineClick = () => {
    setShowDeclinedMessage(true);
  };

  const handleCloseDeclined = () => {
    setShowDeclinedMessage(false);
    onDecline();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          if (showDeclinedMessage) handleCloseDeclined();
          else onDecline();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        {showDeclinedMessage ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("startDeclinedTitleLine1")}
                <br />
                {t("startDeclinedTitleLine2")}
              </DialogTitle>
              <DialogDescription>
                {t("startDeclinedDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end">
              <Button onClick={handleCloseDeclined} className="min-h-[44px]">
                {t("close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{t("startTitle")}</DialogTitle>
              <div className="relative my-4 w-full overflow-hidden rounded-lg">
                <Image
                  src="/tutorial_main_image.webp"
                  alt={t("startImageAlt")}
                  width={1040}
                  height={669}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>
              <DialogDescription className="mb-2">
                {t("startDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:justify-end">
              <Button
                variant="info"
                onClick={onConfirm}
                className="min-h-[44px]"
              >
                {t("startConfirm")}
              </Button>
              <Button
                variant="outline"
                onClick={handleDeclineClick}
                className="min-h-[44px]"
              >
                {t("startDecline")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

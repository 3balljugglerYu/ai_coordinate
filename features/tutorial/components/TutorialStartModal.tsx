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
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden rounded-3xl border-0 bg-[linear-gradient(160deg,#ffffff_0%,#fff5f9_55%,#fff3e8_100%)] p-6 shadow-[0_18px_48px_rgba(236,72,153,0.22),0_6px_16px_rgba(15,23,42,0.08)] sm:max-w-md"
      >
        {showDeclinedMessage ? (
          <>
            <DialogHeader>
              <DialogTitle className="bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-xl font-bold text-transparent">
                {t("startDeclinedTitleLine1")}
                <br />
                {t("startDeclinedTitleLine2")}
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                {t("startDeclinedDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end">
              <Button
                onClick={handleCloseDeclined}
                className="min-h-[44px] rounded-full border-0 bg-gradient-to-r from-pink-500 to-orange-400 font-bold text-white shadow-sm transition hover:from-pink-600 hover:to-orange-500"
              >
                {t("close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-2xl font-bold leading-snug text-transparent">
                {t("startTitle")}
              </DialogTitle>
              <div className="relative my-4 w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-pink-100">
                <Image
                  src="/tutorial_main_image.webp"
                  alt={t("startImageAlt")}
                  width={1040}
                  height={669}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>
              <DialogDescription className="mb-2 text-[0.95rem] leading-relaxed text-slate-600">
                {t("startDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2.5 sm:justify-end">
              <Button
                onClick={onConfirm}
                className="min-h-[48px] rounded-full border-0 bg-gradient-to-r from-pink-500 to-orange-400 text-base font-bold text-white shadow-[0_6px_16px_rgba(236,72,153,0.28)] transition hover:from-pink-600 hover:to-orange-500"
              >
                {t("startConfirm")}
              </Button>
              <Button
                variant="outline"
                onClick={handleDeclineClick}
                className="min-h-[44px] rounded-full border-slate-200 bg-white font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
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

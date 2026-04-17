"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import type { OneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";

interface OneTapStyleDetailCardProps {
  preset: OneTapStylePresetMetadata;
}

export function OneTapStyleDetailCard({
  preset,
}: OneTapStyleDetailCardProps) {
  const router = useRouter();
  const t = useTranslations("style");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirm = () => {
    setIsConfirmOpen(false);
    router.push(`/style?style=${encodeURIComponent(preset.id)}`);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">
        {t("detailPresetLabel")}
      </p>
      <StylePresetPreviewCard
        preset={preset}
        alt={t("detailPresetCardAlt", { name: preset.title })}
        onClick={() => setIsConfirmOpen(true)}
      />
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detailReuseConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("detailReuseConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detailReuseConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t("detailReuseConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

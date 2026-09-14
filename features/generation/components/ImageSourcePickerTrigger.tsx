"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ImageSourcePickerTriggerProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function ImageSourcePickerTrigger({
  onClick,
  disabled = false,
  className,
}: ImageSourcePickerTriggerProps) {
  const t = useTranslations("imageSourcePicker");
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("triggerLabel")}
      className={cn("w-full justify-center gap-2", className)}
    >
      <Images className="h-4 w-4" />
      <span>{t("triggerLabel")}</span>
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </Button>
  );
}

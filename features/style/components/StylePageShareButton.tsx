"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function StylePageShareButton() {
  const t = useTranslations("style");
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      if (
        typeof window === "undefined" ||
        !navigator.clipboard ||
        !navigator.clipboard.writeText
      ) {
        throw new Error(t("shareCopyFailed"));
      }

      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: t("shareCopyTitle"),
        description: t("shareCopyDescription"),
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("shareCopyFailed"),
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void handleCopy();
      }}
      className="mt-1 h-8 shrink-0 gap-1.5 rounded-full border-slate-300 px-2.5 text-xs font-medium text-slate-700 shadow-sm"
      aria-label={t("shareCopyAriaLabel")}
    >
      <Copy className="h-3.5 w-3.5" />
      <span>{t("shareCopyAction")}</span>
    </Button>
  );
}

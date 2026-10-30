"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface CatalogReferenceIntroSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_KEYS = [
  "catalogReferenceIntroStep1",
  "catalogReferenceIntroStep2",
  "catalogReferenceIntroStep3",
] as const;

/**
 * 見本を使える人に、最初の1回だけ出す案内(第2案の「先行公開」)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 */
export function CatalogReferenceIntroSheet({ open, onOpenChange }: CatalogReferenceIntroSheetProps) {
  const t = useTranslations("free");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        data-testid="catalog-reference-intro-sheet"
      >
        <div className="mx-auto w-full max-w-md space-y-5">
          <SheetHeader className="items-start gap-3 px-0 text-left">
            <span className="inline-flex h-6 items-center rounded-full bg-violet-50 px-2.5 text-xs font-bold tracking-wide text-violet-800">
              {t("catalogReferenceBeta")}
            </span>
            <SheetTitle className="text-xl leading-snug text-balance">
              {t("catalogReferenceIntroTitle")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex items-center justify-center gap-2" aria-hidden="true">
            <span className="flex aspect-[3/4] w-20 items-center justify-center rounded-lg bg-gray-200 text-xs text-gray-700">
              {t("catalogReferenceOwnImage")}
            </span>
            <Plus className="h-4 w-4 flex-none text-muted-foreground" />
            <span className="flex aspect-[3/4] w-20 items-center justify-center rounded-lg bg-[repeating-linear-gradient(45deg,#ede9fe_0_8px,#f5f3ff_8px_16px)] text-xs text-violet-800">
              {t("catalogReferenceImageAlt")}
            </span>
            <ArrowRight className="h-4 w-4 flex-none text-muted-foreground" />
            <span className="flex aspect-[3/4] w-20 items-center justify-center rounded-lg bg-gradient-to-b from-pink-100 to-orange-100 text-xs text-gray-800">
              {t("catalogReferenceIntroResult")}
            </span>
          </div>

          <ol className="space-y-3">
            {STEP_KEYS.map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed text-foreground">{t(key)}</span>
              </li>
            ))}
          </ol>

          <Button
            type="button"
            className="h-12 w-full rounded-xl text-base font-bold"
            onClick={() => onOpenChange(false)}
          >
            {t("catalogReferenceIntroTry")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("catalogReferenceIntroLimited")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

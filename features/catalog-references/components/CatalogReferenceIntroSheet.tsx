"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { REFERENCE_STRIPES_CLASS } from "./reference-styles";
import { SheetCloseButton } from "./SheetCloseButton";

interface CatalogReferenceIntroSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 「ためしてみる」を押した(「イラストから」のタブへ移る) */
  onTry: () => void;
}

const STEP_KEYS = [
  "catalogReferenceIntroStep1",
  // 作る画面の一言と同じ文(「見本の画像は、あなたと運営だけが見られます」)
  "catalogReferenceHint",
  "catalogReferenceIntroStep3",
] as const;

/**
 * 見本を使える人に、最初の1回だけ出す案内(第2案の「先行公開」)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 */
export function CatalogReferenceIntroSheet({ open, onOpenChange, onTry }: CatalogReferenceIntroSheetProps) {
  const t = useTranslations("free");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        data-testid="catalog-reference-intro-sheet"
      >
        <div className="mx-auto w-full max-w-md space-y-5">
          <SheetHeader className="items-start gap-3 px-0 text-left">
            <div className="flex w-full items-start justify-between gap-3">
              <span className="inline-flex h-6 items-center rounded-full bg-violet-50 px-2.5 text-xs font-bold tracking-wide text-violet-800">
                {t("catalogReferenceBeta")}
              </span>
              <SheetCloseButton label={t("catalogReferenceSheetClose")} />
            </div>
            <SheetTitle className="text-xl leading-snug text-balance">
              {t("catalogReferenceIntroTitle")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex items-center justify-center gap-2" aria-hidden="true">
            <span className="flex aspect-[3/4] w-20 items-center justify-center rounded-lg bg-gray-200 text-xs text-gray-700">
              {t("catalogReferenceOwnImage")}
            </span>
            <Plus className="h-4 w-4 flex-none text-muted-foreground" />
            <span
              className={cn(
                "flex aspect-[3/4] w-20 items-center justify-center rounded-lg text-xs text-violet-800",
                REFERENCE_STRIPES_CLASS,
              )}
            >
              {t("catalogReferenceIntroReference")}
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
            onClick={onTry}
          >
            {t("catalogReferenceIntroTry")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("catalogReferenceIntroLimited")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Brush,
  Camera,
  Check,
  Contact,
  Copyright,
  Gamepad2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { SheetCloseButton } from "./SheetCloseButton";

interface CatalogReferenceConsentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 「わかりました」を押した(見るだけのときは閉じるだけ) */
  onAgree: () => void;
  /** consent: 見本を選んだ直後(同意を取る) / view: あとから見返す */
  mode: "consent" | "view";
  /** 「次からは出ません」を出すか(一度も同意したことが無い人の、初めての同意のときだけ) */
  showOnceNote: boolean;
  /** もう一度同意が要るわけ(上げようとしたら断られたとき)。シートの中に出す */
  notice?: string | null;
}

type Example = { icon: LucideIcon; label: string };

const USABLE: Example[] = [
  { icon: Camera, label: "catalogReferenceConsentOwnPhoto" },
  { icon: Brush, label: "catalogReferenceConsentOwnDrawing" },
  { icon: Sparkles, label: "catalogReferenceConsentOwnPersta" },
];

const UNUSABLE: Example[] = [
  { icon: Gamepad2, label: "catalogReferenceConsentOfficial" },
  { icon: Copyright, label: "catalogReferenceConsentOthersWork" },
  { icon: Contact, label: "catalogReferenceConsentRealPerson" },
];

/**
 * 「使える見本・使えない見本」(第2案)。計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * 有効な同意が無い人にだけ、見本を選んだ直後に出し、作り直しになりやすいものを先に絵で見せる
 * (毎回のチェックはやめた。「わかりました」でサーバーに本人の同意を残し、見本の行には DB がその時刻を写す)。
 * 閉じたら、選んだ画像は上げない。
 */
export function CatalogReferenceConsentSheet({
  open,
  onOpenChange,
  onAgree,
  mode,
  showOnceNote,
  notice = null,
}: CatalogReferenceConsentSheetProps) {
  const t = useTranslations("free");
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        data-testid="catalog-reference-consent-sheet"
      >
        <SheetHeader className="flex-row items-start justify-between gap-3 px-0 text-left">
          <div className="min-w-0 space-y-1.5">
            <SheetTitle className="text-lg">{t("catalogReferenceConsentTitle")}</SheetTitle>
            <SheetDescription>{t("catalogReferenceConsentLead")}</SheetDescription>
          </div>
          <SheetCloseButton label={t("catalogReferenceSheetClose")} />
        </SheetHeader>

        <div className="mx-auto w-full max-w-md space-y-4">
          {notice ? (
            <p
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900"
              role="status"
            >
              {notice}
            </p>
          ) : null}
          <ExampleRow title={t("catalogReferenceConsentUsable")} examples={USABLE} usable />
          <ExampleRow title={t("catalogReferenceConsentUnusable")} examples={UNUSABLE} usable={false} />

          <p className="text-sm leading-relaxed text-foreground">{t("catalogReferenceConsent")}</p>
          <Button
            type="button"
            className="h-12 w-full rounded-xl text-base font-bold"
            onClick={onAgree}
          >
            {t("catalogReferenceConsentAgree")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "consent" && showOnceNote ? `${t("catalogReferenceConsentOnce")} ` : null}
            <a
              href={localizePublicPath("/community-guidelines", locale)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline underline-offset-2"
            >
              {t("catalogReferenceConsentGuidelines")}
            </a>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ExampleRow({
  title,
  examples,
  usable,
}: {
  title: string;
  examples: Example[];
  usable: boolean;
}) {
  const t = useTranslations("free");
  const Mark = usable ? Check : X;
  return (
    <section className="space-y-2">
      <h3 className={cn("text-sm font-bold", usable ? "text-green-800" : "text-red-800")}>{title}</h3>
      <ul className="grid grid-cols-3 gap-2">
        {examples.map(({ icon: Icon, label }) => (
          <li key={label} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "relative flex aspect-square w-full items-center justify-center rounded-xl",
                usable ? "bg-green-50" : "bg-red-50",
              )}
              aria-hidden="true"
            >
              <Icon className={cn("h-9 w-9", usable ? "text-green-700" : "text-red-700")} strokeWidth={1.6} />
              <span
                className={cn(
                  "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full",
                  usable ? "bg-green-600" : "bg-red-600",
                )}
              >
                <Mark className="h-3 w-3 text-white" strokeWidth={3.2} />
              </span>
            </span>
            <span className="text-center text-xs leading-snug text-foreground">{t(label)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

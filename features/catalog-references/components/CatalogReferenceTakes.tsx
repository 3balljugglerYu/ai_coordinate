"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock, Mountain, PersonStanding, ScanEye, Shirt, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATALOG_REFERENCE_TAKES,
  type CatalogReferenceTake,
} from "@/shared/generation/catalog-reference";
import type { CatalogReferenceValue } from "./CatalogReferencePicker";

interface CatalogReferenceTakesProps {
  value: CatalogReferenceValue;
  onChange: (value: CatalogReferenceValue) => void;
  disabled?: boolean;
}

/** カードの並び(画面の案のとおり。送るときは決まった順にそろえる) */
const DISPLAY_ORDER: CatalogReferenceTake[] = ["outfit", "pose", "angle", "background"];

const TAKE_CARDS = {
  outfit: { icon: Shirt, label: "catalogReferenceTakeOutfit", hint: "catalogReferenceTakeOutfitHint" },
  pose: { icon: PersonStanding, label: "catalogReferenceTakePose", hint: "catalogReferenceTakePoseHint" },
  angle: { icon: ScanEye, label: "catalogReferenceTakeAngle", hint: "catalogReferenceTakeAngleHint" },
  background: { icon: Mountain, label: "catalogReferenceTakeBackground", hint: "catalogReferenceTakeBackgroundHint" },
} as const satisfies Record<CatalogReferenceTake, { icon: LucideIcon; label: string; hint: string }>;

/**
 * 見本を入れたあとに出す部分(第2案)。計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * - 公開の前に運営が確認することを、作る前に帯で知らせる
 * - 「見本から、まねるもの」は、絵と一行の説明つきのカード(いくつでも選べる。0個なら選ぶように出す)
 * - まねないもの(顔・髪型・絵のタッチ)を書く
 */
export function CatalogReferenceTakes({ value, onChange, disabled = false }: CatalogReferenceTakesProps) {
  const t = useTranslations("free");
  const labelId = useId();

  const toggleTake = (take: CatalogReferenceTake) => {
    const selected = !value.takes.includes(take);
    // 持つ順はいつも決まった順(衣装・アングル・ポーズ・背景)にする
    const takes = CATALOG_REFERENCE_TAKES.filter((key) =>
      key === take ? selected : value.takes.includes(key),
    );
    onChange({ ...value, takes });
  };

  return (
    <div className="space-y-4" data-testid="catalog-reference-takes">
      <p
        className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900"
        data-testid="catalog-reference-review-banner"
      >
        <Clock className="mt-0.5 h-4 w-4 flex-none text-amber-700" aria-hidden="true" />
        <span>{t("catalogReferenceReviewBanner")}</span>
      </p>

      <fieldset className="space-y-2" aria-labelledby={labelId}>
        <div className="flex items-baseline justify-between gap-2">
          <span id={labelId} className="text-base font-medium">
            {t("catalogReferenceTakesLabel")}
          </span>
          <span className="text-xs text-muted-foreground">{t("catalogReferenceTakesAny")}</span>
        </div>
        <div className="grid gap-2">
          {DISPLAY_ORDER.map((take) => {
            const card = TAKE_CARDS[take];
            const Icon = card.icon;
            const checked = value.takes.includes(take);
            return (
              <button
                key={take}
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-labelledby={`${labelId}-${take}`}
                aria-describedby={`${labelId}-${take}-hint`}
                onClick={() => toggleTake(take)}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  checked ? "border-violet-600 bg-violet-50" : "border-gray-200 bg-white hover:border-gray-300",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 flex-none items-center justify-center rounded-lg",
                    checked ? "bg-violet-100" : "bg-gray-100",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-6 w-6 text-violet-800" />
                </span>
                <span className="min-w-0 flex-1">
                  <span id={`${labelId}-${take}`} className="block text-sm font-bold">
                    {t(card.label)}
                  </span>
                  <span id={`${labelId}-${take}-hint`} className="block text-xs leading-snug text-muted-foreground">
                    {t(card.hint)}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-[1.5px]",
                    checked ? "border-violet-600 bg-violet-600" : "border-gray-300",
                  )}
                  aria-hidden="true"
                >
                  {checked ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {value.takes.length === 0 ? (
          <p className="text-sm text-destructive">{t("catalogReferenceTakesRequired")}</p>
        ) : null}
        <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="block font-bold text-foreground">{t("catalogReferenceNotTaken")}</span>
          <span className="block">{t("catalogReferenceNotTakenKeep")}</span>
        </p>
      </fieldset>
    </div>
  );
}

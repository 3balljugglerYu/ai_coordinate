"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * /coordinate を未ログインで開いたときに上部に常時表示する CTA。
 *
 * UCL-005 / Phase 6 計画書。
 *
 * リンクは AuthModal ではなくフルページ /login への遷移にしている。
 * 理由: ページ全体に AuthModal を 1 か所だけ管理する仕組みを増やさず、
 * /coordinate ページ自体は static / RSC を維持するため。
 * モデル選択ロックや結果保存 CTA からの呼び出しは個別に AuthModal を出す
 * (`<GenerationForm>` / `<GuestResultPreview>` 内で完結)。
 */
export function CoordinateGuestLoginCta() {
  const t = useTranslations("coordinate");
  return (
    <div
      data-testid="coordinate-guest-login-cta"
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3 sm:items-center">
        <Sparkles
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 sm:mt-0"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {t("guestLoginCtaTitle")}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {t("guestLoginCtaDescription")}
          </p>
        </div>
      </div>
      <Link href="/login" className="self-end sm:self-auto">
        <Button type="button" variant="default" size="sm">
          {t("guestLoginCtaAction")}
        </Button>
      </Link>
    </div>
  );
}

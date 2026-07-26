"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useCurrentUrlForRedirect } from "@/lib/build-current-url";

/**
 * /free (じゆうモード) を未ログインで開いたときに表示するログイン誘導 CTA。
 *
 * じゆうモードはゲスト生成に対応しない(ログイン必須)ため、ゲスト試用バナー
 * (GuestGenerationTrialCta) ではなくログイン専用の CTA を出す。生成フォーム自体を
 * 表示しないので、ここではフルページ /login への遷移のみを提供する。
 */
export function FreeGuestLoginCta() {
  const t = useTranslations("free");
  const redirectUrl = useCurrentUrlForRedirect();
  const loginHref = redirectUrl
    ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
    : "/login";

  return (
    <div
      data-testid="free-guest-login-cta"
      className="flex flex-col items-center gap-4 rounded-2xl border border-pink-100 bg-white/70 px-4 py-12 text-center"
    >
      <Sparkles className="h-8 w-8 text-pink-500" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-gray-900">
          {t("loginCtaTitle")}
        </p>
        <p className="text-sm text-gray-600">{t("loginCtaDescription")}</p>
      </div>
      <Button asChild>
        <Link href={loginHref}>{t("loginCtaAction")}</Link>
      </Button>
    </div>
  );
}

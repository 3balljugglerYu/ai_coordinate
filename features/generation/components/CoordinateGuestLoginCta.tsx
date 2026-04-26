"use client";

import { useTranslations } from "next-intl";
import { GuestGenerationTrialCta } from "./GuestGenerationTrialCta";

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
    <GuestGenerationTrialCta
      title={t("guestLoginCtaTitle")}
      description={t("guestLoginCtaDescription")}
      actionLabel={t("guestLoginCtaAction")}
      testId="coordinate-guest-login-cta"
    />
  );
}

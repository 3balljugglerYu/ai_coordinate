import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { AuthPageContainer } from "@/features/auth/components/AuthPageContainer";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("auth");

  const metadata = createMarketingPageMetadata({
    title: t("signupTitle"),
    description: t("signupDescription"),
    path: "/signup",
    locale,
  });

  return {
    ...metadata,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default function SignupPage() {
  return (
    <AuthPageContainer>
      <AuthForm mode="signup" />
    </AuthPageContainer>
  );
}

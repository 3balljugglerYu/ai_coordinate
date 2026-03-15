import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { AuthPageContainer } from "@/features/auth/components/AuthPageContainer";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return {
    title: locale === "ja" ? "新規登録 | Persta.AI" : "Sign up | Persta.AI",
    description:
      locale === "ja"
        ? "Persta.AI のアカウントを作成"
        : "Create your Persta.AI account",
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

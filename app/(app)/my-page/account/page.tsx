import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MessageCircle } from "lucide-react";
import { AccountManagementPage } from "@/features/account/components/AccountManagementPage";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("myPage");

  return createMarketingPageMetadata({
    title: t("accountTitle"),
    description: t("accountDescription"),
    path: "/my-page/account",
    locale,
  });
}

export default async function MyPageAccountPage() {
  const myPageT = await getTranslations("myPage");
  const navT = await getTranslations("nav");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{myPageT("accountTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {myPageT("accountDescription")}
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link href="/my-page/contact" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                {navT("contact")}
              </Link>
            </Button>
          </div>
          <AccountManagementPage />
        </div>
      </div>
    </div>
  );
}

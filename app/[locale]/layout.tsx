import {notFound} from "next/navigation";
import {setRequestLocale} from "next-intl/server";
import {connection} from "next/server";
import {isLocale} from "@/i18n/config";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  await connection();
  const {locale} = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return children;
}

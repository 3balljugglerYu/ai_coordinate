import {notFound} from "next/navigation";
import {setRequestLocale} from "next-intl/server";
import {isLocale} from "@/i18n/config";
import {TopTabsSlot} from "@/components/TopTabsSlot";

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
  const {locale} = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  /*
    画面上部のタブの入れ物。カタログの3つのタブ(/styles・/user-styles は
    (styles-catalog)、/free は (app) の枠)に共通の親はこの layout だけなので、
    ここに置くと枠をまたいでもタブが作り直されない。
    カタログ刷新(公開前は運営だけ)の人にだけ描き、一般の利用者には何も描かない
    (docs/planning/catalog-three-tabs-implementation-plan.md ADR-001)。
  */
  return (
    <>
      <TopTabsSlot />
      {children}
    </>
  );
}

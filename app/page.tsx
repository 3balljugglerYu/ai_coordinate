import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";

/**
 * ルート `/` へのアクセスをロケール付きパスへリダイレクト。
 * 通常は proxy が先にリダイレクトするが、フォールバックとして機能する。
 */
export default async function RootPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  redirect(localizePublicPath("/", locale));
}

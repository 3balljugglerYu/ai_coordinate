import {getRequestConfig} from "next-intl/server";
import {DEFAULT_LOCALE, isLocale} from "@/i18n/config";
import {getAllMessages} from "@/i18n/messages";

export default getRequestConfig(async ({locale, requestLocale}) => {
  const requestedLocale = locale ?? (await requestLocale);
  const resolvedLocale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;

  return {
    locale: resolvedLocale,
    messages: await getAllMessages(resolvedLocale),
  };
});


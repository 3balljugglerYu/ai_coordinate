"use client";

import {useEffect} from "react";
import {useLocale} from "next-intl";
import {DEFAULT_LOCALE, getLocaleDir, isLocale} from "@/i18n/config";

export function LocaleDocumentAttributes() {
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDir(locale);
    document.documentElement.classList.add("ppr-locale-ready");
  }, [locale]);

  return null;
}

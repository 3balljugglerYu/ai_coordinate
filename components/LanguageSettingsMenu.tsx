"use client";

import {useTransition} from "react";
import {useLocale, useTranslations} from "next-intl";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {Languages} from "lucide-react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {
  appendSearchAndHash,
  DEFAULT_LOCALE,
  getLocaleCookieMaxAge,
  isLocale,
  isPublicPath,
  localizePublicPath,
  LOCALE_COOKIE,
  stripLocalePrefix,
  type Locale,
} from "@/i18n/config";

interface LanguageSettingsMenuProps {
  variant: "dropdown" | "sidebar";
  onSelect?: () => void;
}

const localeOptions: Locale[] = ["ja", "en"];

export function LanguageSettingsMenu({
  variant,
  onSelect,
}: LanguageSettingsMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const commonT = useTranslations("common");
  const [, startTransition] = useTransition();

  const handleLocaleChange = (nextLocaleValue: string) => {
    if (!isLocale(nextLocaleValue) || nextLocaleValue === locale) {
      return;
    }

    document.cookie = `${LOCALE_COOKIE}=${nextLocaleValue}; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`;
    onSelect?.();

    const currentPathname = pathname ?? "/";
    const normalizedPathname = stripLocalePrefix(currentPathname).pathname;
    const search = searchParams.toString();
    const hash = typeof window === "undefined" ? "" : window.location.hash;

    startTransition(() => {
      if (isPublicPath(normalizedPathname)) {
        const nextHref = appendSearchAndHash(
          localizePublicPath(normalizedPathname, nextLocaleValue),
          search,
          hash
        );

        window.location.assign(nextHref);
        return;
      }

      router.refresh();
    });
  };

  if (variant === "sidebar") {
    return (
      <div className="border-t px-4 pb-2 pt-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Languages className="h-4 w-4" />
          <span>{commonT("localeLabel")}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {localeOptions.map((option) => {
            const isActive = option === locale;
            return (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                className={cn("w-full justify-center", !isActive && "text-gray-700")}
                onClick={() => handleLocaleChange(option)}
              >
                {option === "ja" ? commonT("localeJa") : commonT("localeEn")}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages className="mr-2 h-4 w-4" />
        {commonT("localeLabel")}
        <DropdownMenuShortcut>
          {locale === "ja" ? commonT("localeJa") : commonT("localeEn")}
        </DropdownMenuShortcut>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={handleLocaleChange}
        >
          <DropdownMenuRadioItem value="ja">
            {commonT("localeJa")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">
            {commonT("localeEn")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

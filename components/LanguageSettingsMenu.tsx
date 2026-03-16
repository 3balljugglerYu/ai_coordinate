"use client";

import {useEffect, useLayoutEffect, useRef, useState, useTransition} from "react";
import {createPortal} from "react-dom";
import {useLocale, useTranslations} from "next-intl";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {Check, ChevronRight, Globe} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  variant: "dropdown" | "sidebar" | "header";
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
  const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
  const sidebarMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sidebarPanelRef = useRef<HTMLDivElement | null>(null);
  const [sidebarFlyoutStyle, setSidebarFlyoutStyle] = useState<{
    left: number;
    top: number;
  }>({ left: 16, top: 16 });
  const [, startTransition] = useTransition();

  const updateSidebarFlyoutPosition = () => {
    if (!sidebarTriggerRef.current) {
      return;
    }

    const triggerRect = sidebarTriggerRef.current.getBoundingClientRect();
    const panelWidth = sidebarPanelRef.current?.offsetWidth ?? 224;
    const panelHeight = sidebarPanelRef.current?.offsetHeight ?? 0;
    const viewportPadding = 16;
    const gap = 12;

    const left = Math.max(
      viewportPadding,
      Math.min(
        triggerRect.right + gap,
        window.innerWidth - panelWidth - viewportPadding
      )
    );
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;
    const top = Math.max(
      viewportPadding,
      Math.min(
        triggerCenterY - panelHeight / 2,
        window.innerHeight - panelHeight - viewportPadding
      )
    );

    setSidebarFlyoutStyle({ left, top });
  };

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

  useLayoutEffect(() => {
    if (variant !== "sidebar" || !isSidebarMenuOpen) {
      return;
    }

    updateSidebarFlyoutPosition();
    const frameId = window.requestAnimationFrame(updateSidebarFlyoutPosition);

    const handleViewportChange = () => {
      updateSidebarFlyoutPosition();
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !sidebarMenuRef.current?.contains(target) &&
        !sidebarPanelRef.current?.contains(target)
      ) {
        setIsSidebarMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSidebarMenuOpen, variant]);

  useEffect(() => {
    setIsSidebarMenuOpen(false);
  }, [pathname]);

  const currentLocaleLabel =
    locale === "ja" ? commonT("localeJa") : commonT("localeEn");

  const localeOptionsContent = (
    <DropdownMenuRadioGroup value={locale} onValueChange={handleLocaleChange}>
      <DropdownMenuRadioItem value="ja">
        {commonT("localeJa")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="en">
        {commonT("localeEn")}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );

  if (variant === "sidebar") {
    return (
      <div ref={sidebarMenuRef} className="relative">
        <button
          ref={sidebarTriggerRef}
          type="button"
          aria-label={commonT("localeLabel")}
          aria-expanded={isSidebarMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            if (!isSidebarMenuOpen) {
              updateSidebarFlyoutPosition();
            }
            setIsSidebarMenuOpen((open) => !open);
          }}
          className={cn(
            "group flex w-full items-center py-2 text-sm font-medium transition-all duration-200 hover:bg-gray-100",
            isSidebarMenuOpen ? "bg-gray-50 text-gray-900" : "text-gray-600 hover:text-gray-900"
          )}
        >
          <div className="flex w-[72px] shrink-0 items-center justify-center">
            <Globe className="h-5 w-5" />
          </div>
          <div className="flex min-w-0 flex-1 items-center pr-4">
            <span className="truncate whitespace-nowrap">
              {currentLocaleLabel}
            </span>
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
                isSidebarMenuOpen && "translate-x-0.5 text-gray-600"
              )}
            />
          </div>
        </button>

        {isSidebarMenuOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={sidebarPanelRef}
                role="menu"
                aria-label={commonT("localeLabel")}
                className="fixed z-[70] max-h-[calc(100vh-32px)] w-56 overflow-y-auto rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-2xl backdrop-blur-xl"
                style={sidebarFlyoutStyle}
              >
                <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  {commonT("localeLabel")}
                </div>
                <div className="space-y-1">
                  {localeOptions.map((option) => {
                    const isActive = option === locale;
                    const optionLabel =
                      option === "ja" ? commonT("localeJa") : commonT("localeEn");
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={isActive}
                        className={cn(
                          "flex w-full items-center rounded-xl px-3 py-3 text-sm transition-colors duration-200",
                          isActive
                            ? "cursor-default bg-primary/10 text-primary"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        )}
                        onClick={() => {
                          setIsSidebarMenuOpen(false);
                          handleLocaleChange(option);
                        }}
                      >
                        <span>{optionLabel}</span>
                        {isActive ? <Check className="ml-auto h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    );
  }

  if (variant === "header") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            aria-label={commonT("localeLabel")}
            title={currentLocaleLabel}
          >
            <Globe className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {localeOptionsContent}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Globe className="mr-2 h-4 w-4" />
        {commonT("localeLabel")}
        <DropdownMenuShortcut>
          {currentLocaleLabel}
        </DropdownMenuShortcut>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>{localeOptionsContent}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

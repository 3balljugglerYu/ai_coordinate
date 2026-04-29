"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Home, Sparkles, User as UserIcon, LogOut, PanelLeft, PanelRight, Trophy, Bell, MoreHorizontal, MessageCircle /* , Coins */ } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser, onAuthStateChange, signOut } from "@/features/auth/lib/auth-client";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import {
  getCoordinateSourceStockSavePromptDot,
  subscribeCoordinateSourceStockSavePromptDot,
} from "@/features/generation/lib/coordinate-source-stock-save-prompt-state";
import { useMissionDots } from "@/features/challenges/components/MissionDotProvider";
import { LanguageSettingsMenu } from "@/components/LanguageSettingsMenu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
  stripLocalePrefix,
} from "@/i18n/config";
import { requiresAuthForGuestNavigation } from "@/lib/navigation-auth";

const SIDEBAR_OPEN_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_STORAGE_KEY = "appSidebar:open";
const shouldShowSidebar = (pathname: string | null) => {
  if (!pathname) return false;
  // 全てのページでサイドバーを表示する
  return true;
};

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const navT = useTranslations("nav");
  const commonT = useTranslations("common");
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "closed";
  });
  const [isOthersOpen, setIsOthersOpen] = useState(false);
  const [, startTransition] = useTransition();
  const hasPrefetched = useRef(false);
  const { hasSidebarDot, markAnnouncementPageSeen } = useUnreadNotificationCount();
  const [
    hasCoordinateSourceStockSavePromptDot,
    setHasCoordinateSourceStockSavePromptDot,
  ] = useState(getCoordinateSourceStockSavePromptDot);
  const { hasMissionTabDot, markMissionTabSnoozed } = useMissionDots();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const sidebarActive = useMemo(() => shouldShowSidebar(pathname), [pathname]);
  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  const localizedHomePath = localizePublicPath("/", locale);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      setUser(currentUser);
    });

    const subscription = onAuthStateChange((nextUser) => {
      setUser(nextUser);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user && !hasPrefetched.current) {
      router.prefetch(localizedHomePath);
      router.prefetch("/coordinate");
      router.prefetch("/challenge");
      router.prefetch("/notifications");
      router.prefetch("/my-page");
      router.prefetch("/my-page/contact");
      hasPrefetched.current = true;
    }
  }, [localizedHomePath, user, router]);

  useEffect(() => {
    return subscribeCoordinateSourceStockSavePromptDot(
      setHasCoordinateSourceStockSavePromptDot
    );
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const width = sidebarActive
      ? isOpen
        ? `${SIDEBAR_OPEN_WIDTH}px`
        : `${SIDEBAR_COLLAPSED_WIDTH}px`
      : "0px";
    document.documentElement.style.setProperty("--app-sidebar-width", width);

    return () => {
      document.documentElement.style.setProperty("--app-sidebar-width", "0px");
    };
  }, [isOpen, sidebarActive, isMounted]);

  if (!isMounted || !sidebarActive) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push(localizedHomePath);
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleNavigation = (path: string) => {
    const normalizedTargetPath = stripLocalePrefix(path).pathname;

    if (
      normalizedTargetPath === "/challenge" &&
      normalizedPathname === normalizedTargetPath
    ) {
      markMissionTabSnoozed();
    }

    if (normalizedPathname === normalizedTargetPath) {
      return;
    }

    startTransition(() => {
      if (requiresAuthForGuestNavigation(normalizedTargetPath) && !user) {
        router.push(`/login?redirect=/`);
        return;
      }

      if (normalizedTargetPath === "/notifications") {
        void markAnnouncementPageSeen();
      }
      if (normalizedTargetPath === "/challenge") {
        markMissionTabSnoozed();
      }

      router.push(path);
    });
  };

  const navItems = [
    { path: localizedHomePath, label: navT("home"), icon: Home },
    { path: "/coordinate", label: navT("coordinate"), icon: Sparkles },
    { path: "/challenge", label: navT("challenge"), icon: Trophy },
    { path: "/notifications", label: navT("notifications"), icon: Bell },
    { path: "/my-page", label: navT("myPage"), icon: UserIcon },
    // { path: "/my-page/credits", label: "ペルコイン", icon: Coins },
  ];

  return (
    <aside
      className={cn(
        "fixed left-0 bottom-0 z-30 hidden lg:flex flex-col border-r bg-white/90 backdrop-blur-xl shadow-lg transition-[width] duration-200",
        isOpen ? "w-[240px]" : "w-[72px]"
      )}
      aria-label="アプリのナビゲーション"
      style={{
        top: "var(--app-header-height, 64px)",
        height: "calc(100vh - var(--app-header-height, 64px))",
      }}
    >
      <div className="flex h-16 items-center">
        {/* 開閉ボタンエリア：常に72px幅で中央寄せ */}
        <div className="flex w-[72px] shrink-0 items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => {
              const next = !isOpen;
              setIsOpen(next);
              localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "open" : "closed");
            }}
            aria-expanded={isOpen}
            aria-label={
              isOpen ? navT("collapseSidebar") : navT("expandSidebar")
            }
          >
            {isOpen ? <PanelLeft className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-1">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive =
            normalizedPathname === stripLocalePrefix(path).pathname;
          return (
            <button
              key={path}
              data-tour={path === "/coordinate" ? "coordinate-nav-desktop" : undefined}
              onClick={() => handleNavigation(path)}
              title={!isOpen ? label : undefined}
              className={cn(
                "group relative flex w-full items-center py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
              aria-label={label}
            >
              {/* アイコンエリア：常に72px幅で中央寄せ */}
              <div className="flex w-[72px] shrink-0 items-center justify-center">
                <div className="relative">
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-transform duration-200",
                      isActive ? "scale-110" : "scale-100"
                    )}
                  />
                  {path === "/notifications" && hasSidebarDot && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                  {path === "/coordinate" &&
                    hasCoordinateSourceStockSavePromptDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                    )}
                  {path === "/challenge" && hasMissionTabDot && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </div>
              </div>

              {/* テキストエリア：isOpenの時のみ表示 */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isOpen ? "w-auto opacity-100" : "w-0 opacity-0"
                )}
              >
                <span className="whitespace-nowrap pr-4">{label}</span>
              </div>

              {isActive && (
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t py-3">
        {isOpen ? (
          <>
            <LanguageSettingsMenu variant="sidebar" />
            {user ? (
              <Collapsible open={isOthersOpen} onOpenChange={setIsOthersOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "group flex w-full items-center py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-100",
                      isOthersOpen && "bg-gray-50"
                    )}
                    aria-expanded={isOthersOpen}
                    aria-label={navT("openOthers")}
                  >
                    <div className="flex w-[72px] shrink-0 items-center justify-center">
                      <MoreHorizontal className="h-5 w-5" />
                    </div>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        isOpen ? "w-auto opacity-100" : "w-0 opacity-0"
                      )}
                    >
                      <span className="whitespace-nowrap pr-4">{navT("others")}</span>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <button
                    onClick={() => handleNavigation("/my-page/contact")}
                    className={cn(
                      "group flex w-full items-center py-2 pl-[72px] pr-4 text-sm font-medium transition-all duration-200 hover:bg-gray-100",
                      normalizedPathname === "/my-page/contact"
                        ? "bg-primary/10 text-primary"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                    aria-label={navT("contact")}
                  >
                    <MessageCircle className="mr-2 h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{navT("contact")}</span>
                  </button>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        ) : user ? (
          /* サイドバー折りたたみ時は直接お問い合わせへ */
          <button
            onClick={() => handleNavigation("/my-page/contact")}
            className={cn(
              "group flex w-full items-center py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-100",
              normalizedPathname === "/my-page/contact" &&
                "bg-primary/10 text-primary"
            )}
            aria-label={navT("contact")}
          >
            <div className="flex w-[72px] shrink-0 items-center justify-center">
              <MessageCircle className="h-5 w-5" />
            </div>
          </button>
        ) : null}
      </div>

      <div className="border-t py-3">
        {user ? (
          <button
            className={cn(
              "group flex w-full items-center py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-100",
            )}
            onClick={handleSignOut}
          >
            <div className="flex w-[72px] shrink-0 items-center justify-center">
              <LogOut className="h-5 w-5" />
            </div>
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                isOpen ? "w-auto opacity-100" : "w-0 opacity-0"
              )}
            >
              <span className="whitespace-nowrap pr-4">{navT("logout")}</span>
            </div>
          </button>
        ) : (
          <button
            className={cn(
              "group flex w-full items-center py-2 text-sm font-medium transition-all duration-200 hover:bg-gray-100",
            )}
            onClick={() => handleNavigation("/login")}
            aria-label={commonT("login")}
          >
            <div className="flex w-[72px] shrink-0 items-center justify-center">
              <UserIcon className="h-5 w-5" />
            </div>
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                isOpen ? "w-auto opacity-100" : "w-0 opacity-0"
              )}
            >
              <span className="whitespace-nowrap pr-4">{commonT("login")}</span>
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}

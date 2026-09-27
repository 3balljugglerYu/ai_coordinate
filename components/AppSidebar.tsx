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
import { Home, LayoutGrid, Sparkles, User as UserIcon, LogOut, PanelLeft, PanelRight, Trophy, Bell, MoreHorizontal, MessageCircle, Heart /* , Coins */ } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/features/auth/hooks/use-auth-user";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";
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
import {
  CATALOG_ENTRY_PATH,
  GENERATION_ENTRY_PATH,
  isNavItemActive,
  resolveGenerationEntryPath,
} from "@/lib/nav-entries";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useWardrobeSaveTrigger } from "@/features/wardrobe/hooks/use-wardrobe-save";

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
  const styleT = useTranslations("style");
  // カタログ刷新(段階公開中は運営のみ)では「カタログ」を足し、生成の入口を「つくる」にする。
  // ボトムナビ(NavigationBar)と同じ並び・同じ判定にする(lib/nav-entries.ts)。
  const isCatalogRevamp = useStylesCatalogRevamp();
  const saveTrigger = useWardrobeSaveTrigger();
  // 確認に失敗した間は loading のまま取り直す(「ログイン」に倒さない。2026-09-27)
  const { status: authStatus, user } = useAuthUser();
  const signOutAndLeave = useSignOut();
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
    if (user && !hasPrefetched.current) {
      router.prefetch(localizedHomePath);
      router.prefetch(localizePublicPath("/coordinate", locale));
      router.prefetch(localizePublicPath("/style", locale));
      router.prefetch("/challenge");
      router.prefetch("/notifications");
      router.prefetch("/my-page");
      router.prefetch("/my-page/contact");
      hasPrefetched.current = true;
    }
  }, [localizedHomePath, locale, user, router]);

  // 刷新後に増える行き先(カタログと Free Style)も先読みする。
  // 運営の判定はマウント後に確定するので、上の1回きりの先読みとは分けて見る。
  useEffect(() => {
    if (user && isCatalogRevamp) {
      router.prefetch(localizePublicPath(CATALOG_ENTRY_PATH, locale));
      router.prefetch(localizePublicPath("/free", locale));
    }
  }, [isCatalogRevamp, locale, user, router]);

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

  const handleSignOut = () => {
    // 成功したらホームへ全画面遷移、失敗したらトーストで知らせる
    void signOutAndLeave(localizedHomePath);
  };

  const handleNavigation = (path: string) => {
    let normalizedTargetPath = stripLocalePrefix(path).pathname;
    let resolvedPath = path;

    // 生成の入口は押したときに行き先を決める。刷新前(コーディネート)は前回使った
    // 生成モードへ、刷新後(つくる)は毎回 Free Style へ。チュートリアルツアー中は
    // ツアーの目的地(/style)へ固定する(詳細は lib/nav-entries.ts)。
    if (normalizedTargetPath === GENERATION_ENTRY_PATH) {
      const preferred = resolveGenerationEntryPath(isCatalogRevamp);
      if (preferred !== GENERATION_ENTRY_PATH) {
        // path 内の "/coordinate" のみ差し替え、ロケールプレフィックスや
        // クエリ・ハッシュ等の付随情報を維持する。
        resolvedPath = path.replace(GENERATION_ENTRY_PATH, preferred);
        normalizedTargetPath = preferred;
      }
    }

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
      // 未ログインと確定したときだけログインへ回す。確認中(loading)は目的地へ進み、
      // 本当に未ログインなら行き先のページ側がログインへ回す
      if (
        requiresAuthForGuestNavigation(normalizedTargetPath) &&
        authStatus === "signed-out"
      ) {
        router.push(`/login?redirect=/`);
        return;
      }

      if (normalizedTargetPath === "/notifications") {
        void markAnnouncementPageSeen();
      }
      if (normalizedTargetPath === "/challenge") {
        markMissionTabSnoozed();
      }

      // 公開パス(/coordinate, /style 等)はロケール付き URL へ直接遷移し、
      // proxy の 307 リダイレクトを介さない(1 ホップ分速くする)。
      router.push(localizePublicPath(resolvedPath, locale));
    });
  };

  const navItems = [
    { path: localizedHomePath, label: navT("home"), icon: Home },
    ...(isCatalogRevamp
      ? [{ path: CATALOG_ENTRY_PATH, label: navT("catalog"), icon: LayoutGrid }]
      : []),
    {
      path: GENERATION_ENTRY_PATH,
      label: isCatalogRevamp ? navT("create") : navT("coordinate"),
      icon: Sparkles,
    },
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
          const normalizedItemPath = stripLocalePrefix(path).pathname;
          // 生成の入口は生成モード全体の入口、カタログは /user-styles も含めて
          // アクティブ表示する(lib/nav-entries.ts)。
          const isActive = isNavItemActive(
            normalizedItemPath,
            normalizedPathname,
            isCatalogRevamp
          );
          return (
            <button
              key={path}
              data-tour={path === GENERATION_ENTRY_PATH ? "coordinate-nav-desktop" : undefined}
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
                  {path === GENERATION_ENTRY_PATH &&
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
        {authStatus === "loading" ? (
          // 確認が済むまではログイン・ログアウト・保存するのどれも出さない(高さだけ確保)
          <div className="h-9" aria-hidden="true" />
        ) : user ? (
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
        ) : saveTrigger.hasGuestImage ? (
          // 生成後のゲスト: ログインの代わりに「保存する」(signup固定+画像引き継ぎ)。
          <button
            className={cn(
              "group flex w-full items-center py-2 text-sm font-medium transition-all duration-200 hover:bg-gray-100",
            )}
            onClick={saveTrigger.trigger}
            aria-label={styleT("wardrobeSaveButton")}
          >
            <div className="flex w-[72px] shrink-0 items-center justify-center">
              <Heart className="h-5 w-5" />
            </div>
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                isOpen ? "w-auto opacity-100" : "w-0 opacity-0"
              )}
            >
              <span className="whitespace-nowrap pr-4">
                {styleT("wardrobeSaveButton")}
              </span>
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

      {/* 生成後ゲストの保存導線(signup固定)。生成前/通常時は閉じたまま。 */}
      <AuthModal {...saveTrigger.authModalProps} />
    </aside>
  );
}

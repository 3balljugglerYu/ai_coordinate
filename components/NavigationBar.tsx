"use client";

import {
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
  useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Home, Sparkles, User as UserIcon, Trophy, Bell /* , Coins */ } from "lucide-react";
import { getCurrentUser, onAuthStateChange } from "@/features/auth/lib/auth-client";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { useMissionDots } from "@/features/challenges/components/MissionDotProvider";
import {
  getCoordinateSourceStockSavePromptDot,
  subscribeCoordinateSourceStockSavePromptDot,
} from "@/features/generation/lib/coordinate-source-stock-save-prompt-state";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
  stripLocalePrefix,
} from "@/i18n/config";
import { requiresAuthForGuestNavigation } from "@/lib/navigation-auth";

export function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const navT = useTranslations("nav");
  const [user, setUser] = useState<User | null>(null);
  // トランジション状態: ナビゲーションを非ブロッキングにする
  const [, startTransition] = useTransition();
  // プリフェッチ実行フラグ: 1回のみ実行するため
  const hasPrefetched = useRef(false);
  const pendingResetTimeoutRef = useRef<number | null>(null);
  const pendingSourcePathRef = useRef<string | null>(null);
  const { hasSidebarDot, markAnnouncementPageSeen } = useUnreadNotificationCount();
  const { hasMissionTabDot, markMissionTabSnoozed } = useMissionDots();
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);
  const [
    hasCoordinateSourceStockSavePromptDot,
    setHasCoordinateSourceStockSavePromptDot,
  ] = useState(getCoordinateSourceStockSavePromptDot);
  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  const localizedHomePath = localizePublicPath("/", locale);
  const effectiveActivePathname = pendingPathname ?? normalizedPathname;

  const clearPendingNavigationFromEffect = useEffectEvent(() => {
    if (pendingResetTimeoutRef.current) {
      clearTimeout(pendingResetTimeoutRef.current);
      pendingResetTimeoutRef.current = null;
    }

    pendingSourcePathRef.current = null;
    setPendingPathname(null);
  });

  useEffect(() => {
    // 初回ロード時のユーザー取得
    getCurrentUser().then((user) => {
      setUser(user);
    });

    // 認証状態の変更を監視
    const subscription = onAuthStateChange((user) => {
      setUser(user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 認証済みユーザーに対して主要ページをプリフェッチ（他画面から戻った際の即表示用）
  useEffect(() => {
    if (user && !hasPrefetched.current) {
      router.prefetch(localizedHomePath);
      router.prefetch("/coordinate");
      router.prefetch("/challenge");
      router.prefetch("/notifications");
      router.prefetch("/my-page");
      hasPrefetched.current = true;
    }
  }, [localizedHomePath, user, router]);

  useEffect(() => {
    if (!pendingPathname || !pendingSourcePathRef.current) {
      return;
    }

    if (normalizedPathname !== pendingSourcePathRef.current) {
      clearPendingNavigationFromEffect();
    }
  }, [normalizedPathname, pendingPathname]);

  useEffect(() => {
    return () => {
      if (pendingResetTimeoutRef.current) {
        clearTimeout(pendingResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeCoordinateSourceStockSavePromptDot(
      setHasCoordinateSourceStockSavePromptDot
    );
  }, []);

  const handleNavigation = (path: string) => {
    const normalizedTargetPath = stripLocalePrefix(path).pathname;

    if (
      normalizedTargetPath === "/challenge" &&
      normalizedPathname === normalizedTargetPath
    ) {
      markMissionTabSnoozed();
    }

    if (pendingPathname || normalizedPathname === normalizedTargetPath) {
      return;
    }

    let destinationPath = path;
    let pendingTargetPath = normalizedTargetPath;

    if (requiresAuthForGuestNavigation(normalizedTargetPath) && !user) {
      destinationPath = `/login?redirect=/`;
      pendingTargetPath = "/login";
    }

    pendingSourcePathRef.current = normalizedPathname;
    setPendingPathname(pendingTargetPath);
    if (pendingResetTimeoutRef.current) {
      clearTimeout(pendingResetTimeoutRef.current);
    }
    pendingResetTimeoutRef.current = window.setTimeout(() => {
      pendingResetTimeoutRef.current = null;
      pendingSourcePathRef.current = null;
      setPendingPathname(null);
    }, 2000);

    // startTransitionでナビゲーションを非ブロッキングにする
    startTransition(() => {
      if (normalizedTargetPath === "/notifications") {
        void markAnnouncementPageSeen();
      }
      if (normalizedTargetPath === "/challenge") {
        markMissionTabSnoozed();
      }

      router.push(destinationPath);
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
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-sm shadow-lg lg:hidden safe-area-inset-bottom">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-2">
          {/* ナビゲーションアイテム */}
          <div className="flex flex-1 items-center justify-around">
            {navItems.map(({ path, label, icon: Icon }) => {
              const normalizedItemPath = stripLocalePrefix(path).pathname;
              const isActive = effectiveActivePathname === normalizedItemPath;
              return (
                <button
                  key={path}
                  data-tour={path === "/coordinate" ? "coordinate-nav-mobile" : undefined}
                  onClick={() => handleNavigation(path)}
                  disabled={pendingPathname !== null}
                  className={cn(
                    "relative flex min-w-[60px] flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium transition-all duration-200 ease-out",
                    "active:scale-80 active:opacity-80 disabled:cursor-wait",
                    "md:flex-row md:gap-2 md:text-sm",
                    pendingPathname !== null && !isActive && "opacity-60",
                    isActive
                      ? "text-primary"
                      : "text-gray-400"
                  )}
                >
                  {/* アクティブインジケーター（上部のバー） */}
                  <span 
                    className={cn(
                      "absolute top-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-200 ease-out",
                      isActive ? "opacity-100 w-8 nav-indicator-expand" : "opacity-0 w-0"
                    )}
                  />
                  {/* アイコン */}
                  <div className="relative">
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-all duration-200",
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
                  {/* ラベル */}
                  <span className="transition-all duration-200">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

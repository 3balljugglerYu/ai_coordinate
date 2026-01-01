"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, User as UserIcon, LogOut, PanelLeft, PanelRight, Coins } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/constants";
import { getCurrentUser, onAuthStateChange, signOut } from "@/features/auth/lib/auth-client";

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
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [, startTransition] = useTransition();
  const hasPrefetched = useRef(false);

  const sidebarActive = useMemo(() => shouldShowSidebar(pathname), [pathname]);

  useEffect(() => {
    // クライアントサイドでのみ実行される
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === "closed") {
      setIsOpen(false);
    }
    setIsMounted(true);
  }, []);

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
      router.prefetch("/coordinate");
      router.prefetch("/my-page");
      hasPrefetched.current = true;
    }
  }, [user, router]);

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
      router.push("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleNavigation = (path: string) => {
    if (pathname === path) {
      return;
    }

    startTransition(() => {
      if ((path === "/coordinate" || path.startsWith("/my-page")) && !user) {
        router.push(`/login?redirect=/`);
        return;
      }
      router.push(path);
    });
  };

  const navItems = [
    { path: "/", label: "ホーム", icon: Home },
    { path: "/coordinate", label: "コーディネート", icon: Sparkles },
    { path: "/my-page", label: "マイページ", icon: UserIcon },
    { path: "/my-page/credits", label: "クレジット", icon: Coins },
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
            aria-label={isOpen ? "サイドバーを折りたたむ" : "サイドバーを展開する"}
          >
            {isOpen ? <PanelLeft className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-1">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = pathname === path;
          return (
            <button
              key={path}
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
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform duration-200",
                    isActive ? "scale-110" : "scale-100"
                  )}
                />
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
              <span className="whitespace-nowrap pr-4">ログアウト</span>
            </div>
          </button>
        ) : (
          <button
            className={cn(
              "group flex w-full items-center py-2 text-sm font-medium transition-all duration-200 hover:bg-gray-100",
            )}
            onClick={() => handleNavigation("/login")}
            aria-label="ログインへ移動"
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
              <span className="whitespace-nowrap pr-4">ログイン</span>
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}

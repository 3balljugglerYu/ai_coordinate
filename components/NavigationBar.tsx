"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, User as UserIcon, Trophy, Bell /* , Coins */ } from "lucide-react";
import { getCurrentUser, onAuthStateChange } from "@/features/auth/lib/auth-client";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";

export function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  // トランジション状態: ナビゲーションを非ブロッキングにする
  const [, startTransition] = useTransition();
  // プリフェッチ実行フラグ: 1回のみ実行するため
  const hasPrefetched = useRef(false);
  const { unreadCount } = useUnreadNotificationCount();

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

  // 認証済みユーザーに対して主要ページをプリフェッチ
  useEffect(() => {
    if (user && !hasPrefetched.current) {
      // 認証が必要なページをプリフェッチ
      router.prefetch("/coordinate");
      router.prefetch("/challenge");
      router.prefetch("/notifications");
      router.prefetch("/my-page");
      hasPrefetched.current = true;
    }
  }, [user, router]);

  const handleNavigation = (path: string) => {
    if (pathname === path) {
      return;
    }

    // startTransitionでナビゲーションを非ブロッキングにする
    startTransition(() => {
      // コーディネートとマイページ関連は認証必須
      if (
        (path === "/coordinate" ||
          path === "/challenge" ||
          path === "/notifications" ||
          path.startsWith("/my-page")) &&
        !user
      ) {
        router.push(`/login?redirect=/`);
        return;
      }
      router.push(path);
    });
  };

  const navItems = [
    { path: "/", label: "ホーム", icon: Home },
    { path: "/coordinate", label: "コーディネート", icon: Sparkles },
    { path: "/challenge", label: "チャレンジ", icon: Trophy },
    { path: "/notifications", label: "お知らせ", icon: Bell },
    { path: "/my-page", label: "マイページ", icon: UserIcon },
    // { path: "/my-page/credits", label: "ペルコイン", icon: Coins },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-sm shadow-lg lg:hidden safe-area-inset-bottom">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-2">
          {/* ナビゲーションアイテム */}
          <div className="flex flex-1 items-center justify-around">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => handleNavigation(path)}
                  className={cn(
                    "relative flex min-w-[60px] flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-all duration-200 ease-out",
                    "active:scale-80 active:opacity-80",
                    "md:flex-row md:gap-2 md:text-sm",
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
                    {path === "/notifications" && unreadCount > 0 && (
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

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, User as UserIcon, LogOut } from "lucide-react";
import { getCurrentUser, signOut, onAuthStateChange } from "@/features/auth/lib/auth-client";
import type { User } from "@supabase/supabase-js";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 楽観的UI更新: クリックしたパスを一時的に保持
  const [clickedPath, setClickedPath] = useState<string | null>(null);

  useEffect(() => {
    // 初回ロード時のユーザー取得
    getCurrentUser().then((user) => {
      setUser(user);
      setIsLoading(false);
    });

    // 認証状態の変更を監視
    const subscription = onAuthStateChange((user) => {
      setUser(user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // pathnameが更新されたら、楽観的UI更新をクリア（遷移完了）
  useEffect(() => {
    if (clickedPath && pathname === clickedPath) {
      setClickedPath(null);
    }
  }, [pathname, clickedPath]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleNavigation = (path: string) => {
    // 楽観的UI更新: 即座にアクティブ表示にする
    setClickedPath(path);

    // コーディネートとマイページは認証必須
    if ((path === "/coordinate" || path === "/my-page") && !user) {
      router.push(`/login?next=${path}`);
      return;
    }
    // ホームページへの遷移時はリセットパラメータを追加
    if (path === "/") {
      router.push("/?reset=true");
      return;
    }
    router.push(path);
  };

  const navItems = [
    { path: "/", label: "ホーム", icon: Home },
    { path: "/coordinate", label: "コーディネート", icon: Sparkles },
    { path: "/my-page", label: "マイページ", icon: UserIcon },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-sm shadow-lg md:hidden safe-area-inset-bottom">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-2">
        {/* ナビゲーションアイテム */}
        <div className="flex flex-1 items-center justify-around">
          {navItems.map(({ path, label, icon: Icon }) => {
            // 楽観的UI更新: pathnameまたはclickedPathのどちらかが一致すればアクティブ
            const isActive = pathname === path || clickedPath === path;
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
                    : "text-gray-600"
                )}
              >
                {/* アクティブインジケーター（上部のバー） */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary transition-all duration-200" />
                )}
                {/* アイコン */}
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isActive ? "scale-110" : "scale-100"
                  )}
                />
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
  );
}


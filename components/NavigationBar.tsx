"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, User, LogOut } from "lucide-react";
import { getCurrentUser, signOut, onAuthStateChange } from "@/features/auth/lib/auth-client";
import type { User } from "@supabase/supabase-js";
import { Button } from "./ui/button";

export function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleNavigation = (path: string) => {
    // コーディネートとマイページは認証必須
    if ((path === "/coordinate" || path === "/my-page") && !user) {
      router.push(`/login?next=${path}`);
      return;
    }

    router.push(path);
  };

  const navItems = [
    { path: "/", label: "ホーム", icon: Home },
    { path: "/coordinate", label: "コーディネート", icon: Sparkles },
    { path: "/my-page", label: "マイページ", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-lg md:top-0 md:bottom-auto">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* ナビゲーションアイテム */}
        <div className="flex flex-1 items-center justify-around md:justify-start md:gap-8">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = pathname === path;
            return (
              <button
                key={path}
                onClick={() => handleNavigation(path)}
                className={`flex min-w-[60px] flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-colors md:flex-row md:gap-2 md:text-sm ${
                  isActive
                    ? "text-primary"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* 認証ボタン */}
        <div className="hidden md:flex md:items-center md:gap-4">
          {isLoading ? (
            <div className="h-10 w-24 animate-pulse rounded bg-gray-200" />
          ) : user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {user.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                ログアウト
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/login")}
              >
                ログイン
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/signup")}
              >
                新規登録
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}


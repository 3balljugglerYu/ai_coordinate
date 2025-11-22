"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, User as UserIcon, LogOut } from "lucide-react";
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
    { path: "/my-page", label: "マイページ", icon: UserIcon },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-lg md:hidden">
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

      </div>
    </nav>
  );
}


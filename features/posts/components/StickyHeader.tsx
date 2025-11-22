"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, User, Home, Sparkles, User as UserIcon, LogOut } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { getCurrentUser, signOut, onAuthStateChange } from "@/features/auth/lib/auth-client";
import { APP_NAME } from "@/constants";
import { cn } from "@/lib/utils";

interface StickyHeaderProps {
  children?: React.ReactNode;
  showBackButton?: boolean;
}

/**
 * Sticky headerコンポーネント
 * 下にスクロールで非表示、上にスクロールで表示
 * パスに基づいて戻るボタンの表示を自動制御
 */
export function StickyHeader({ children, showBackButton }: StickyHeaderProps) {
  const scrollDirection = useScrollDirection();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; avatar_url?: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // トップレベルのページ（戻るボタン不要）
  const topLevelPaths = ["/", "/coordinate", "/my-page", "/login", "/signup"];
  const shouldShowBackButton =
    showBackButton !== undefined
      ? showBackButton
      : !topLevelPaths.includes(pathname);

  // 遷移元を確認して戻る先を決定
  const fromParam = searchParams.get("from");
  const backUrl = fromParam === "my-page" ? "/my-page" : "/";

  const navItems = [
    { path: "/", label: "ホーム", icon: Home },
    { path: "/coordinate", label: "コーディネート", icon: Sparkles },
    { path: "/my-page", label: "マイページ", icon: UserIcon },
  ];

  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await getCurrentUser();
        if (user) {
          setCurrentUser({
            id: user.id,
            avatar_url: user.user_metadata?.avatar_url || null,
          });
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        console.error("Auth check error:", error);
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();

    // 認証状態の変更を監視
    const subscription = onAuthStateChange((user: SupabaseUser | null) => {
      if (user) {
        setCurrentUser({
          id: user.id,
          avatar_url: user.user_metadata?.avatar_url || null,
        });
      } else {
        setCurrentUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleNavigation = (path: string) => {
    // コーディネートとマイページは認証必須
    if ((path === "/coordinate" || path === "/my-page") && !currentUser) {
      router.push(`/login?next=${path}`);
      return;
    }
    router.push(path);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      // 状態を即座に更新
      setCurrentUser(null);
      router.push("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  useEffect(() => {
    if (scrollDirection === "down") {
      setIsVisible(false);
    } else if (scrollDirection === "up") {
      setIsVisible(true);
    }
  }, [scrollDirection]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full bg-white/80 backdrop-blur-sm border-b transition-transform duration-300",
        isVisible ? "translate-y-0" : "-translate-y-full"
      )}
    >
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {shouldShowBackButton && (
            <Link href={backUrl}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
            {APP_NAME}
          </Link>
          {/* PC画面でのナビゲーションリンク */}
          <nav className="hidden md:flex md:items-center md:gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => handleNavigation(path)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md",
                    isActive
                      ? "text-primary bg-primary/10"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <>
              {currentUser ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      {currentUser.avatar_url ? (
                        <Image
                          src={currentUser.avatar_url}
                          alt="ユーザー"
                          width={32}
                          height={32}
                          className="rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href="/my-page" className="cursor-pointer">
                        <UserIcon className="mr-2 h-4 w-4" />
                        マイページ
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="text-destructive cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      ログアウト
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/login">
                  <Button variant="outline" size="sm" className="text-xs">
                    ログイン
                  </Button>
                </Link>
              )}
            </>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}


"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, User, User as UserIcon, LogOut, Bell } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getCurrentUser,
  signOut,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import { APP_NAME } from "@/constants";
import { createClient } from "@/lib/supabase/client";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { SearchBar } from "@/features/posts/components/SearchBar";

interface StickyHeaderProps {
  children?: React.ReactNode;
  showBackButton?: boolean;
}

/**
 * Sticky headerコンポーネント
 * 常に表示されるヘッダー
 * パスに基づいて戻るボタンの表示を自動制御
 */
export function StickyHeader({ children, showBackButton }: StickyHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<{ id: string; avatar_url?: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const { unreadCount, markAllRead } = useNotifications();
  const headerRef = useRef<HTMLElement | null>(null);

  // トップレベルのページ
  const topLevelPaths = [
    "/",
    "/coordinate",
    "/my-page",
    "/my-page/credits",
    "/login",
    "/signup",
    "/about",
    "/pricing",
    "/terms",
    "/privacy",
    "/tokushoho",
    "/payment-services-act",
  ];
  const shouldShowBackButton =
    showBackButton !== undefined
      ? showBackButton
      : !topLevelPaths.includes(pathname);

  // 遷移元を確認して戻る先を決定
  const fromParam = searchParams.get("from");
  const backUrl = fromParam === "my-page" ? "/my-page" : "/";

  useEffect(() => {
    const updateHeaderHeight = () => {
      const height = headerRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty("--app-header-height", `${height}px`);
    };

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const fetchProfileAvatar = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Profile fetch error:", error);
        return null;
      }

      return data?.avatar_url ?? null;
    };

    async function checkAuth() {
      try {
        const user = await getCurrentUser();
        if (user) {
          const avatarUrl = await fetchProfileAvatar(user.id);
          if (!isMounted) return;
          setCurrentUser({
            id: user.id,
            avatar_url: avatarUrl,
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
      const handleUserChange = async () => {
        if (user) {
          const avatarUrl = await fetchProfileAvatar(user.id);
          if (!isMounted) return;
          setCurrentUser({
            id: user.id,
            avatar_url: avatarUrl,
          });
        } else {
          setCurrentUser(null);
        }
        setIsLoading(false);
      };

      handleUserChange();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleAvatarUpdated = (event: Event) => {
      const newAvatarUrl =
        (event as CustomEvent<{ avatarUrl?: string | null }>).detail?.avatarUrl ?? null;

      setCurrentUser((prev) =>
        prev ? { ...prev, avatar_url: newAvatarUrl } : prev
      );
    };

    window.addEventListener("profile:avatarUpdated", handleAvatarUpdated);
    return () => {
      window.removeEventListener("profile:avatarUpdated", handleAvatarUpdated);
    };
  }, []);

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

  const isSearchPage = pathname === "/search";

  // ヘッダー左側（戻るボタン + ロゴ）の共通コンポーネント
  const HeaderLeft = () => (
    <div className="flex items-center gap-4 flex-shrink-0">
      {shouldShowBackButton && (
        <Link href={backUrl}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
      )}
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700 whitespace-nowrap"
      >
        <Image
          src="/icons/icon-192.png"
          alt="Persta.AI ロゴ"
          width={24}
          height={24}
          className="rounded-md"
        />
        <span>{APP_NAME}</span>
      </Link>
    </div>
  );

  // ヘッダー右側（通知 + ユーザーアイコン）の共通コンポーネント
  const HeaderRight = () => (
    <div className="flex items-center gap-2 flex-shrink-0">
      {!isLoading && (
        <>
          {/* 通知バッジ（認証済みユーザーのみ） */}
          {currentUser && (
            <DropdownMenu
              open={isNotificationOpen}
              onOpenChange={(open) => {
                setIsNotificationOpen(open);
                // ドロップダウンが開くタイミングで既読にする
                if (open) {
                  markAllRead();
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative flex items-center justify-center p-2 h-auto"
                  aria-label={`通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ""}`}
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-80 max-h-[80vh] overflow-hidden flex flex-col p-0"
              >
                <div className="p-4 border-b">
                  <h3 className="font-semibold">通知</h3>
                </div>
                <div className="overflow-y-auto flex-1 max-h-[60vh]">
                  <NotificationList />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
  );

  // 検索バーの配置を条件分岐で切り替え
  const renderSearchBar = () => {
    if (isSearchPage) {
      // 検索ページ: PC版のみ1箇所に表示
      return (
        <div className="flex-1 min-w-0 mx-2 md:max-w-xs lg:max-w-sm">
          <SearchBar />
        </div>
      );
    } else {
      // 通常ページ: PC版とモバイル版で分離
      return (
        <>
          <div className="flex-1 min-w-0 mx-2 hidden md:block md:max-w-xs lg:max-w-sm">
            <SearchBar />
          </div>
          <div className="flex-1 min-w-0 mx-2 md:hidden max-w-[180px]">
            <SearchBar />
          </div>
        </>
      );
    }
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b shadow-sm"
    >
      {/* モバイル版の検索ページ: 簡素化されたヘッダー（検索バーのみ） */}
      {isSearchPage && (
        <div className="w-full px-4 py-3 flex items-center justify-center md:hidden">
          <div className="w-full max-w-2xl">
            <SearchBar />
          </div>
        </div>
      )}
      {/* PC版のヘッダー（検索ページ含む）とモバイル版の通常ヘッダー */}
      <div className={`w-full px-4 py-3 flex items-center justify-between gap-2 flex-nowrap ${isSearchPage ? "hidden md:flex" : ""}`}>
        <HeaderLeft />
        {renderSearchBar()}
        <HeaderRight />
      </div>
    </header>
  );
}

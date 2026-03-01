"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, User, User as UserIcon } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenuItems } from "@/features/auth/components/UserMenuItems";
import {
  getCurrentUser,
  signOut,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import { APP_NAME, ROUTES } from "@/constants";
import { createClient } from "@/lib/supabase/client";
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
  const headerRef = useRef<HTMLElement | null>(null);

  // トップレベルのページ（戻るボタン非表示）
  const topLevelPaths = [
    ROUTES.HOME,
    ROUTES.COORDINATE,
    "/challenge",
    ROUTES.MY_PAGE,
    "/notifications",
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
  const isMyPageSubPath = pathname.startsWith("/my-page/") && pathname !== "/my-page";
  const backUrl =
    fromParam === "my-page"
      ? ROUTES.MY_PAGE
      : fromParam === "notifications"
        ? "/notifications"
        : fromParam === "coordinate"
          ? ROUTES.COORDINATE
          : isMyPageSubPath
            ? ROUTES.MY_PAGE
            : ROUTES.HOME;

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
      router.refresh();
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

  // ヘッダー右側（ユーザーアイコン）の共通コンポーネント
  const HeaderRight = () => (
    <div className="flex items-center gap-2 flex-shrink-0">
      {isLoading ? (
        <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
      ) : (
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
              <DropdownMenuContent align="end" className="w-44">
                <UserMenuItems includeMyPage onSignOut={handleSignOut} />
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

  // モバイル版: マイページではヘッダーを非表示（ハンバーガーメニューでナビゲーション）
  const isMyPage = pathname === "/my-page";
  const headerClassName = isMyPage
    ? "sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b shadow-sm hidden lg:flex"
    : "sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b shadow-sm";

  return (
    <header ref={headerRef} className={headerClassName}>
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

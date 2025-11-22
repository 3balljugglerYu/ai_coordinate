"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import { APP_NAME } from "@/constants";
import { cn } from "@/lib/utils";

interface StickyHeaderProps {
  children?: React.ReactNode;
  showBackButton?: boolean;
}

/**
 * Sticky headerコンポーネント
 * 下にスクロールで非表示、上にスクロールで表示
 */
export function StickyHeader({ children, showBackButton = true }: StickyHeaderProps) {
  const scrollDirection = useScrollDirection();
  const [isVisible, setIsVisible] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; avatar_url?: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  }, []);

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
        <div className="flex items-center gap-2">
          {showBackButton && (
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
            {APP_NAME}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <>
              {currentUser ? (
                <Link href="/my-page">
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
                </Link>
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


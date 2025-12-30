"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import { AuthModal } from "@/features/auth/components/AuthModal";

interface FollowButtonProps {
  userId: string;
  currentUserId?: string | null;
}

/**
 * フォローボタンコンポーネント
 * フォロー/フォロー解除ボタン、オプティミスティックUI更新
 */
export function FollowButton({ userId, currentUserId: propCurrentUserId }: FollowButtonProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(propCurrentUserId || null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();

  // 現在のユーザーIDを取得
  useEffect(() => {
    if (!propCurrentUserId) {
      getCurrentUser().then((user) => {
        setCurrentUserId(user?.id || null);
      });
    }
  }, [propCurrentUserId]);

  // フォロー状態を取得
  useEffect(() => {
    if (!currentUserId || currentUserId === userId) {
      setIsLoadingStatus(false);
      return;
    }

    fetch(`/api/users/${userId}/follow-status`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("フォロー状態の取得に失敗しました");
        }
        return res.json();
      })
      .then((data) => {
        setIsFollowing(data.isFollowing || false);
        setIsLoadingStatus(false);
      })
      .catch((error) => {
        console.error("Failed to get follow status:", error);
        setIsLoadingStatus(false);
      });
  }, [userId, currentUserId]);

  const handleToggleFollow = async () => {
    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    if (currentUserId === userId) {
      return;
    }

    setIsLoading(true);

    // オプティミスティックUI更新
    const previousIsFollowing = isFollowing;
    setIsFollowing(!previousIsFollowing);

    try {
      if (previousIsFollowing) {
        // フォロー解除
        const response = await fetch(`/api/users/${userId}/follow`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "フォロー解除に失敗しました");
        }
      } else {
        // フォロー
        const response = await fetch(`/api/users/${userId}/follow`, {
          method: "POST",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "フォローに失敗しました");
        }
      }
    } catch (error) {
      // エラー時は元の状態に戻す
      setIsFollowing(previousIsFollowing);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "フォローの処理に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 自分自身の場合は表示しない
  if (currentUserId === userId) {
    return null;
  }

  if (isLoadingStatus) {
    return (
      <Button variant="default" size="sm" disabled className="flex items-center gap-2">
        <UserPlus className="h-4 w-4" />
        <span>フォロー</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={isFollowing ? "outline" : "default"}
        size="sm"
        onClick={handleToggleFollow}
        disabled={isLoading}
        className="flex items-center gap-2"
      >
        {isFollowing ? (
          <>
            <UserMinus className="h-4 w-4" />
            <span>フォロー解除</span>
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            <span>フォロー</span>
          </>
        )}
      </Button>
      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo="/"
      />
    </>
  );
}

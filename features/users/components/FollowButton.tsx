"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { usePathname } from "next/navigation";

interface FollowButtonProps {
  userId: string;
  currentUserId?: string | null;
  onFollowChange?: (isFollowing: boolean) => void;
  /**
   * 既知のフォロー状態。指定すると自前の状態取得を**行わない**。
   *
   * 一覧のように同じボタンが何十個も並ぶ画面では、ボタンごとに
   * `/api/users/{id}/follow-status` を叩くと数十リクエストになり、
   * ブラウザの同時接続上限を食い潰して他の通信(無限スクロール等)を止める。
   * 呼び出し側がバッチで解決済みの値を持っているならそれを渡す。
   */
  initialIsFollowing?: boolean;
}

/**
 * フォローボタンコンポーネント
 * フォロー/フォロー解除ボタン、オプティミスティックUI更新
 */
export function FollowButton({
  userId,
  currentUserId: propCurrentUserId,
  onFollowChange,
  initialIsFollowing,
}: FollowButtonProps) {
  const t = useTranslations("follow");
  const hasKnownStatus = initialIsFollowing !== undefined;
  const [currentUserId, setCurrentUserId] = useState<string | null>(propCurrentUserId || null);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(!hasKnownStatus);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();
  const pathname = usePathname();

  /*
    onFollowChange を effect の依存に置くと、呼び出し側がインライン関数を渡した
    瞬間に「取得 → 再レンダー → 依存が変わる → また取得」の無限ループになる。
    最新の関数だけを ref で持ち、依存からは外す。
  */
  const onFollowChangeRef = useRef(onFollowChange);
  useEffect(() => {
    onFollowChangeRef.current = onFollowChange;
  }, [onFollowChange]);

  // 既知の状態を渡す呼び出し側が値を更新したら追従する
  useEffect(() => {
    if (initialIsFollowing !== undefined) {
      setIsFollowing(initialIsFollowing);
      setIsLoadingStatus(false);
    }
  }, [initialIsFollowing]);

  // 現在のユーザーIDを取得
  useEffect(() => {
    if (!propCurrentUserId) {
      getCurrentUser().then((user) => {
        setCurrentUserId(user?.id || null);
      });
    }
  }, [propCurrentUserId]);

  // フォロー状態を取得（既知の値を渡されているときは問い合わせない）
  useEffect(() => {
    if (hasKnownStatus) {
      return;
    }
    if (!currentUserId || currentUserId === userId) {
      setIsLoadingStatus(false);
      return;
    }

    fetch(`/api/users/${userId}/follow-status`)
      .then((res) => {
        if (!res.ok) {
          // console.error にしか出さない開発者向けの文言。翻訳関数を使うと
          // その identity が依存に入り、effect が毎レンダー走ってしまう
          throw new Error(`follow-status failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setIsFollowing(data.isFollowing || false);
        onFollowChangeRef.current?.(data.isFollowing || false);
        setIsLoadingStatus(false);
      })
      .catch((error) => {
        console.error("Failed to get follow status:", error);
        setIsLoadingStatus(false);
      });
  }, [userId, currentUserId, hasKnownStatus]);

  const toggleFollow = async () => {
    if (isLoading) return;

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
          throw new Error(error.error || t("unfollowFailed"));
        }

        onFollowChange?.(false);
      } else {
        // フォロー
        const response = await fetch(`/api/users/${userId}/follow`, {
          method: "POST",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || t("followFailed"));
        }

        onFollowChange?.(true);
      }
    } catch (error) {
      // エラー時は元の状態に戻す
      setIsFollowing(previousIsFollowing);
      onFollowChange?.(previousIsFollowing);
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("genericFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    if (currentUserId === userId) {
      return;
    }

    // フォロー解除時はトーストのアクションのみで実行
    if (isFollowing) {
      const confirmToast = toast({
        title: t("confirmUnfollowTitle"),
        description: t("confirmUnfollowDescription"),
        action: (
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              await toggleFollow();
              confirmToast.dismiss();
            }}
          >
            {t("confirmUnfollowAction")}
          </Button>
        ),
      });
      return;
    }

    await toggleFollow();
  };

  // 自分自身の場合は表示しない
  if (currentUserId === userId) {
    return null;
  }

  if (isLoadingStatus) {
    return (
      <Button variant="default" size="sm" disabled className="flex items-center gap-2">
        <UserPlus className="h-4 w-4" />
        <span>{t("follow")}</span>
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
            <span>{t("unfollow")}</span>
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            <span>{t("follow")}</span>
          </>
        )}
      </Button>
      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo={pathname}
      />
    </>
  );
}

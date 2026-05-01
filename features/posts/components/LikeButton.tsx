"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toggleLikeAPI, getUserLikeStatusAPI } from "../lib/api";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { usePathname } from "next/navigation";
import { LikeHeartIcon, type LikeHeartPhase } from "./LikeHeartIcon";
import { AnimatedLikeCount } from "./AnimatedLikeCount";

interface LikeButtonProps {
  imageId: string;
  initialLikeCount: number;
  currentUserId?: string | null;
}

/**
 * いいねボタンコンポーネント
 * オプティミスティックUI更新とリアルタイム更新を実装
 */
export function LikeButton({
  imageId,
  initialLikeCount,
  currentUserId,
}: LikeButtonProps) {
  const t = useTranslations("posts");
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<LikeHeartPhase>("idle");
  const { toast } = useToast();
  const pathname = usePathname();

  // 初期いいね状態を取得
  useEffect(() => {
    if (!currentUserId) {
      setIsLoadingStatus(false);
      return;
    }

    getUserLikeStatusAPI(imageId, {
      likeStatusFetchFailed: t("likeStatusFetchFailed"),
    })
      .then((status) => {
        setIsLiked(status);
        setIsLoadingStatus(false);
      })
      .catch((error) => {
        console.error("Failed to get like status:", error);
        setIsLoadingStatus(false);
      });
  }, [currentUserId, imageId, t]);

  // リアルタイム更新の購読
  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`likes:${imageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "likes",
          filter: `image_id=eq.${imageId}`,
        },
        (payload) => {
          // 自分の操作はオプティミスティックUIで既に反映済みなので、Realtimeイベントではカウントしない
          if (payload.new && (payload.new as any).user_id === currentUserId) {
            return;
          }

          // 他のユーザーの操作のみ反映
          if (payload.eventType === "INSERT") {
            setLikeCount((prev) => prev + 1);
          } else if (payload.eventType === "DELETE") {
            setLikeCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [imageId, currentUserId]);

  const handleToggleLike = async () => {
    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    if (isLoading) return;

    // オプティミスティックUI更新
    const previousLikeCount = likeCount;
    const previousIsLiked = isLiked;

    setIsLiked(!isLiked);
    setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
    setIsLoading(true);

    // 自分のタップで「未いいね → いいね」のときだけバースト演出。
    // 取り消し時は控えめな押下フィードバックのみ。
    setAnimationPhase(previousIsLiked ? "press" : "burst");

    try {
      const newIsLiked = await toggleLikeAPI(imageId, {
        likeToggleFailed: t("likeToggleFailed"),
      });
      setIsLiked(newIsLiked);
      
      // カウントを再取得（オプティミスティックUIのロールバック用）
      // 実際にはRealtimeで更新されるので、ここでは更新しない
    } catch (error) {
      // エラー時はロールバック
      setIsLiked(previousIsLiked);
      setLikeCount(previousLikeCount);
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("likeToggleFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleLike}
        disabled={isLoading || isLoadingStatus}
        // disabled:opacity-100 で Button の既定 disabled:opacity-50 を上書きする。
        // 楽観的更新で赤に切り替わったハートが、API 応答待ち中に半透明化して
        // 「薄赤」として見えてしまうのを防ぐ。
        className="flex items-center gap-1.5 px-2 py-1 h-auto disabled:opacity-100"
      >
        <LikeHeartIcon
          liked={isLiked}
          phase={animationPhase}
          size="md"
          onAnimationEnd={() => setAnimationPhase("idle")}
        />
        <AnimatedLikeCount
          value={likeCount}
          className="text-sm font-medium"
        />
      </Button>
      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo={pathname}
      />
    </>
  );
}

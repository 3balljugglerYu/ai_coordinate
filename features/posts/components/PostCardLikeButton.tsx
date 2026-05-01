"use client";

import { useState, useEffect } from "react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toggleLikeAPI, getUserLikeStatusAPI } from "../lib/api";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { formatCountEnUS } from "@/lib/utils";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { usePathname, useSearchParams } from "next/navigation";
import { LikeHeartIcon, type LikeHeartPhase } from "./LikeHeartIcon";
import { AnimatedLikeCount } from "./AnimatedLikeCount";

interface PostCardLikeButtonProps {
  imageId: string;
  initialLikeCount: number;
  initialViewCount: number;
  currentUserId?: string | null;
}

/**
 * 投稿一覧用の軽量いいねボタンコンポーネント
 * オプティミスティックUI更新とリアルタイム更新を実装
 */
export function PostCardLikeButton({
  imageId,
  initialLikeCount,
  initialViewCount,
  currentUserId,
}: PostCardLikeButtonProps) {
  const t = useTranslations("posts");
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<LikeHeartPhase>("idle");
  const { toast } = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectPath =
    searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

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

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation(); // カードクリックイベントを防止

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
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleLike}
        disabled={isLoading || isLoadingStatus}
        // disabled:opacity-100 で Button の既定 disabled:opacity-50 を上書きする。
        // 楽観的更新で赤に切り替わったハートが、API 応答待ち中に半透明化して
        // 「薄赤」として見えてしまうのを防ぐ。
        className="flex items-center gap-1 h-6 !px-0 py-0.5 disabled:opacity-100"
      >
        <LikeHeartIcon
          liked={isLiked}
          phase={animationPhase}
          size="sm"
          onAnimationEnd={() => setAnimationPhase("idle")}
        />
        <AnimatedLikeCount
          value={likeCount}
          className="text-xs font-medium"
        />
      </Button>
      {initialViewCount > 0 && (
        <div className="flex items-center gap-1">
          <Eye className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">{formatCountEnUS(initialViewCount)}</span>
        </div>
      )}
      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo={redirectPath}
      />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Heart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleLikeAPI, getUserLikeStatusAPI } from "../lib/api";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface LikeButtonProps {
  imageId: string;
  initialLikeCount: number;
  initialCommentCount?: number;
  initialViewCount?: number;
  currentUserId?: string | null;
}

/**
 * いいねボタンコンポーネント
 * オプティミスティックUI更新とリアルタイム更新を実装
 */
export function LikeButton({
  imageId,
  initialLikeCount,
  initialCommentCount = 0,
  initialViewCount = 0,
  currentUserId,
}: LikeButtonProps) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const { toast } = useToast();

  // 初期いいね状態を取得
  useEffect(() => {
    if (!currentUserId) {
      setIsLoadingStatus(false);
      return;
    }

    getUserLikeStatusAPI(imageId)
      .then((status) => {
        setIsLiked(status);
        setIsLoadingStatus(false);
      })
      .catch((error) => {
        console.error("Failed to get like status:", error);
        setIsLoadingStatus(false);
      });
  }, [imageId, currentUserId]);

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
      toast({
        title: "ログインが必要です",
        description: "いいねするにはログインしてください",
        variant: "destructive",
      });
      return;
    }

    if (isLoading) return;

    // オプティミスティックUI更新
    const previousLikeCount = likeCount;
    const previousIsLiked = isLiked;

    setIsLiked(!isLiked);
    setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
    setIsLoading(true);

    try {
      const newIsLiked = await toggleLikeAPI(imageId);
      setIsLiked(newIsLiked);
      
      // カウントを再取得（オプティミスティックUIのロールバック用）
      // 実際にはRealtimeで更新されるので、ここでは更新しない
    } catch (error) {
      // エラー時はロールバック
      setIsLiked(previousIsLiked);
      setLikeCount(previousLikeCount);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "いいねの処理に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleLike}
        disabled={isLoading || !currentUserId || isLoadingStatus}
        className="flex items-center gap-1.5 px-2 py-1 h-auto"
      >
        <Heart
          className={`h-5 w-5 transition-colors ${
            isLiked ? "fill-red-500 text-red-500" : "text-gray-600"
          }`}
        />
        <span className="text-sm font-medium">{likeCount}</span>
      </Button>
      {initialCommentCount > 0 && (
        <span className="text-sm text-gray-600">
          💬 {initialCommentCount}
        </span>
      )}
      {initialViewCount > 0 && (
        <div className="flex items-center gap-1">
          <Eye className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">{initialViewCount}</span>
        </div>
      )}
    </div>
  );
}


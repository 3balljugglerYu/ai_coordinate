"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleLikeAPI, getUserLikeStatusAPI } from "../lib/api";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface PostCardLikeButtonProps {
  imageId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  currentUserId?: string | null;
}

/**
 * 投稿一覧用の軽量いいねボタンコンポーネント
 * オプティミスティックUI更新とリアルタイム更新を実装
 */
export function PostCardLikeButton({
  imageId,
  initialLikeCount,
  initialCommentCount,
  currentUserId,
}: PostCardLikeButtonProps) {
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

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation(); // カードクリックイベントを防止

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
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleLike}
        disabled={isLoading || !currentUserId || isLoadingStatus}
        className="h-6 px-1.5 py-0.5"
      >
        <Heart
          className={`h-4 w-4 transition-colors ${
            isLiked ? "fill-red-500 text-red-500" : "text-gray-600"
          }`}
        />
        <span className="ml-1 text-xs font-medium">{likeCount}</span>
      </Button>
      {initialCommentCount > 0 && (
        <div className="flex items-center gap-1">
          <MessageCircle className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">{initialCommentCount}</span>
        </div>
      )}
    </div>
  );
}


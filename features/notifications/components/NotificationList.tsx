"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useInView } from "react-intersection-observer";
import { useNotifications } from "../hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { User, Heart, MessageCircle, UserPlus, Bell } from "lucide-react";
import type { Notification } from "../types";

/**
 * 通知リストコンポーネント
 * 通知一覧の表示、クリックで遷移、既読化処理、無限スクロール対応
 */
export function NotificationList() {
  const {
    notifications,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    handleNotificationClick,
    markAllRead,
  } = useNotifications();

  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  // 無限スクロール
  useEffect(() => {
    if (inView && hasMore && !isLoadingMore && !isLoading) {
      loadMore();
    }
  }, [inView, hasMore, isLoadingMore, isLoading, loadMore]);

  // 日付フォーマット
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return "たった今";
    } else if (diffMins < 60) {
      return `${diffMins}分前`;
    } else if (diffHours < 24) {
      return `${diffHours}時間前`;
    } else if (diffDays < 7) {
      return `${diffDays}日前`;
    } else {
      return date.toLocaleDateString("ja-JP", {
        month: "short",
        day: "numeric",
      });
    }
  };

  // 通知タイプに応じたアイコン
  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "like":
        return <Heart className="h-4 w-4 fill-red-500 text-red-500" />;
      case "comment":
        return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case "follow":
        return <UserPlus className="h-4 w-4 text-green-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  // 画像URLを取得（data.image_urlを優先、なければpost.image_url、それでもなければデフォルト）
  const getImageUrl = (notification: Notification): string | null => {
    if (notification.data?.image_url) {
      return notification.data.image_url;
    }
    if (notification.post?.image_url) {
      return notification.post.image_url;
    }
    return null;
  };

  if (isLoading && notifications.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="flex gap-3 animate-pulse"
          >
            <div className="w-10 h-10 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-gray-500 text-sm">通知はありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ヘッダー: 全件既読ボタン */}
      {notifications.some((n) => !n.is_read) && (
        <div className="flex justify-end p-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            className="text-xs"
          >
            すべて既読にする
          </Button>
        </div>
      )}

      {/* 通知一覧 */}
      <div className="flex flex-col divide-y">
        {notifications.map((notification) => {
          const imageUrl = getImageUrl(notification);
          const actorName =
            notification.actor?.nickname || "ユーザー";

          return (
            <button
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={cn(
                "flex gap-3 p-4 text-left hover:bg-gray-50 transition-colors w-full",
                !notification.is_read && "bg-blue-50"
              )}
            >
              {/* アクターのアバター */}
              <div className="flex-shrink-0">
                {notification.actor?.avatar_url ? (
                  <Image
                    src={notification.actor.avatar_url}
                    alt={actorName}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                )}
              </div>

              {/* 通知内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(notification.created_at)}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                </div>

                {/* 投稿画像のプレビュー */}
                {imageUrl && notification.entity_type === "post" && (
                  <div className="mt-2">
                    <Image
                      src={imageUrl}
                      alt="投稿画像"
                      width={60}
                      height={60}
                      className="rounded object-cover"
                    />
                  </div>
                )}
              </div>

              {/* 未読インジケーター */}
              {!notification.is_read && (
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
              )}
            </button>
          );
        })}
      </div>

      {/* 無限スクロールトリガー */}
      {hasMore && (
        <div ref={inViewRef} className="p-4 text-center">
          {isLoadingMore && (
            <p className="text-sm text-gray-500">読み込み中...</p>
          )}
        </div>
      )}
    </div>
  );
}


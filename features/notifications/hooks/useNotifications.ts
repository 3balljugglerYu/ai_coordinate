"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "../lib/api";
import type { Notification } from "../types";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import { useToast } from "@/components/ui/use-toast";

/**
 * 通知機能のカスタムフック
 * 通知一覧、未読数、Realtime購読を管理
 */
export function useNotifications() {
  const router = useRouter();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const hasCheckedInitialBonusNotifications = useRef(false);

  // 初期化: ユーザーIDを取得
  useEffect(() => {
    getCurrentUser().then((user) => {
      setCurrentUserId(user?.id || null);
      // ユーザーIDが変更されたら、チェック済みフラグをリセット
      hasCheckedInitialBonusNotifications.current = false;
    });
  }, []);

  // 未読数を取得
  const fetchUnreadCount = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, [currentUserId]);

  // 通知一覧を取得
  const fetchNotifications = useCallback(
    async (cursor: string | null = null, append: boolean = false) => {
      if (!currentUserId) return;

      try {
        if (!append) {
          setIsLoading(true);
        } else {
          setIsLoadingMore(true);
        }

        // 初期取得時は5件、追加取得時は10件
        const limit = append ? 10 : 5;
        const response = await getNotifications(limit, cursor);
        const newNotifications = response.notifications;

        if (append) {
          setNotifications((prev) => [...prev, ...newNotifications]);
        } else {
          setNotifications(newNotifications);
        }

        setNextCursor(response.nextCursor);
        setHasMore(response.nextCursor !== null);
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [currentUserId]
  );

  // 初期読み込み
  useEffect(() => {
    if (currentUserId) {
      fetchNotifications(null, false);
      fetchUnreadCount();
    }
  }, [currentUserId, fetchNotifications, fetchUnreadCount]);

  // 初期読み込み時に未読のボーナス通知があればToastを表示
  useEffect(() => {
    // ローディング中、通知未取得、または既にチェック済みの場合は実行しない
    // unreadCountの更新を待つため、依存配列に含める（通知取得と未読数取得の両方が完了するまで待つ）
    if (
      !currentUserId ||
      isLoading ||
      notifications.length === 0 ||
      hasCheckedInitialBonusNotifications.current
    )
      return;

    // 未読のボーナス通知をチェック
    const unreadBonusNotifications = notifications.filter(
      (n) => !n.is_read && n.type === "bonus"
    );

    // 未読のボーナス通知があれば、最新の1件をToastで表示
    if (unreadBonusNotifications.length > 0) {
      const latestBonusNotification = unreadBonusNotifications[0];
      toast({
        title: latestBonusNotification.title,
        description: latestBonusNotification.body,
        variant: "default",
      });
    }

    // チェック済みフラグを立てる
    hasCheckedInitialBonusNotifications.current = true;
  }, [currentUserId, isLoading, notifications.length, unreadCount, toast]); // 通知取得と未読数取得の両方が完了するまで待つ

  // Realtime購読
  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          // 新規通知を追加
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // ボーナス通知の場合はToastを表示
          if (newNotification.type === "bonus") {
            toast({
              title: newNotification.title,
              description: newNotification.body,
              variant: "default",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, toast]);

  // 通知を既読化
  const markRead = useCallback(
    async (ids: string[]) => {
      try {
        await markNotificationsRead(ids);
        // 楽観的更新
        setNotifications((prev) =>
          prev.map((n) =>
            ids.includes(n.id)
              ? { ...n, is_read: true, read_at: new Date().toISOString() }
              : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - ids.length));
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
        // エラー時は再取得
        fetchNotifications(null, false);
        fetchUnreadCount();
      }
    },
    [fetchNotifications, fetchUnreadCount]
  );

  // 全件既読化
  const markAllRead = useCallback(async () => {
    // 1. 即座にバッジを消す（楽観的更新）
    setUnreadCount(0);
    // 楽観的更新：通知リストも既読状態に更新
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: new Date().toISOString(),
      }))
    );

    // 2. バックグラウンドでDB更新
    try {
      await markAllNotificationsRead();
      // 成功時は楽観的更新で既に完了している
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      // エラー時は再取得してバッジを再表示
      await fetchUnreadCount();
      fetchNotifications(null, false);
      throw error; // 呼び出し元にエラーを伝播
    }
  }, [fetchNotifications, fetchUnreadCount]);

  // もっと読み込む
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && nextCursor) {
      fetchNotifications(nextCursor, true);
    }
  }, [isLoadingMore, hasMore, nextCursor, fetchNotifications]);

  // 通知をクリックして遷移
  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // 既読化
      if (!notification.is_read) {
        markRead([notification.id]);
      }

      // 遷移
      if (notification.entity_type === "post") {
        router.push(`/posts/${notification.entity_id}`);
      } else if (notification.entity_type === "user") {
        router.push(`/users/${notification.entity_id}`);
      }
    },
    [router, markRead]
  );

  return {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    markRead,
    markAllRead,
    loadMore,
    handleNotificationClick,
    refresh: () => {
      fetchNotifications(null, false);
      fetchUnreadCount();
    },
  };
}


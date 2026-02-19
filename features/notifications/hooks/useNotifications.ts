"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "../lib/api";
import type { Notification } from "../types";
import { getCurrentUser } from "@/features/auth/lib/auth-client";

export interface UseNotificationsInitialData {
  notifications: Notification[];
  nextCursor: string | null;
}
import { useToast } from "@/components/ui/use-toast";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";

const BONUS_TOAST_HISTORY_STORAGE_KEY = "bonus-toast-history:v2";
const BONUS_TOAST_HISTORY_LIMIT = 100;

function getBonusToastStorageKey(userId: string) {
  return `${BONUS_TOAST_HISTORY_STORAGE_KEY}:${userId}`;
}

function createBonusToastSignature(notification: Pick<Notification, "id">) {
  return notification.id;
}

function readBonusToastHistory(userId: string): string[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(getBonusToastStorageKey(userId));
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === "string")
      .slice(-BONUS_TOAST_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeBonusToastHistory(userId: string, signatures: string[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      getBonusToastStorageKey(userId),
      JSON.stringify(signatures.slice(-BONUS_TOAST_HISTORY_LIMIT))
    );
  } catch (error) {
    console.error("Failed to persist bonus toast history:", error);
  }
}

/**
 * 通知機能のカスタムフック
 * 通知一覧、未読数、Realtime購読を管理
 * @param initialData - サーバーキャッシュから渡された初期データ（ある場合スキップして即時表示）
 */
export function useNotifications(initialData?: UseNotificationsInitialData | null) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const hasInitialData = !!initialData?.notifications;
  const [notifications, setNotifications] = useState<Notification[]>(
    initialData?.notifications ?? []
  );
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialData?.nextCursor !== null);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialData?.nextCursor ?? null
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const hasCheckedInitialBonusNotifications = useRef(false);
  const shownBonusToastSignaturesRef = useRef<Set<string>>(new Set());
  const hasAutoMarkedReadOnNotificationsPage = useRef(false);
  const isNotificationsPage = pathname === "/notifications";

  // 初期化: ユーザーIDを取得
  useEffect(() => {
    getCurrentUser().then((user) => {
      setCurrentUserId(user?.id || null);
      // ユーザーIDが変更されたら、チェック済みフラグをリセット
      hasCheckedInitialBonusNotifications.current = false;
    });
  }, []);

  // ユーザーごとのトースト表示履歴を読み込む
  useEffect(() => {
    if (!currentUserId) {
      shownBonusToastSignaturesRef.current = new Set();
      return;
    }

    shownBonusToastSignaturesRef.current = new Set(
      readBonusToastHistory(currentUserId)
    );
  }, [currentUserId]);

  const hasShownBonusToast = useCallback(
    (notification: Pick<Notification, "id">) => {
      const signature = createBonusToastSignature(notification);
      return shownBonusToastSignaturesRef.current.has(signature);
    },
    []
  );

  const syncUnreadBadgeCount = useCallback(() => {
    void refreshUnreadCount().catch((error) => {
      console.error("Failed to sync unread badge count:", error);
    });
  }, [refreshUnreadCount]);

  const markBonusToastAsShown = useCallback(
    (notification: Pick<Notification, "id">) => {
      if (!currentUserId) return;

      const signature = createBonusToastSignature(notification);
      if (shownBonusToastSignaturesRef.current.has(signature)) return;

      const nextHistory = [
        ...shownBonusToastSignaturesRef.current,
        signature,
      ].slice(-BONUS_TOAST_HISTORY_LIMIT);

      shownBonusToastSignaturesRef.current = new Set(nextHistory);
      writeBonusToastHistory(currentUserId, nextHistory);
    },
    [currentUserId]
  );

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

        // 初期取得・追加取得ともに20件
        const limit = 20;
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

  // 初期読み込み（initialData がある場合はスキップ）
  useEffect(() => {
    if (!currentUserId) return;
    if (hasInitialData) {
      fetchUnreadCount();
      return;
    }
    fetchNotifications(null, false);
    fetchUnreadCount();
  }, [currentUserId, hasInitialData, fetchNotifications, fetchUnreadCount]);

  // 初期読み込み時に未読のボーナス通知があればToastを表示
  useEffect(() => {
    // ローディング中、通知未取得、または既にチェック済みの場合は実行しない
    if (
      !currentUserId ||
      isLoading ||
      notifications.length === 0 ||
      hasCheckedInitialBonusNotifications.current
    )
      return;

    // お知らせ画面では初期トーストを出さない
    if (isNotificationsPage) {
      hasCheckedInitialBonusNotifications.current = true;
      return;
    }

    // 未読のボーナス通知をチェック
    const unreadBonusNotifications = notifications.filter(
      (n) => !n.is_read && n.type === "bonus"
    );

    // 未読のボーナス通知があれば、未表示の最新1件だけToastで表示
    const latestBonusNotification = unreadBonusNotifications.find(
      (n) => !hasShownBonusToast(n)
    );

    if (latestBonusNotification) {
      toast({
        title: latestBonusNotification.title,
        description: latestBonusNotification.body,
        variant: "default",
      });
      markBonusToastAsShown(latestBonusNotification);
      syncUnreadBadgeCount();
    }

    // チェック済みフラグを立てる
    hasCheckedInitialBonusNotifications.current = true;
  }, [
    currentUserId,
    hasShownBonusToast,
    isNotificationsPage,
    isLoading,
    markBonusToastAsShown,
    notifications,
    syncUnreadBadgeCount,
    toast,
  ]); // 通知取得が完了するまで待つ

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
          if (
            !isNotificationsPage &&
            newNotification.type === "bonus" &&
            !hasShownBonusToast(newNotification)
          ) {
            toast({
              title: newNotification.title,
              description: newNotification.body,
              variant: "default",
            });
            markBonusToastAsShown(newNotification);
            syncUnreadBadgeCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    currentUserId,
    hasShownBonusToast,
    isNotificationsPage,
    markBonusToastAsShown,
    syncUnreadBadgeCount,
    toast,
  ]);

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
        await refreshUnreadCount();
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
        // エラー時は再取得
        fetchNotifications(null, false);
        fetchUnreadCount();
      }
    },
    [fetchNotifications, fetchUnreadCount, refreshUnreadCount]
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
      await refreshUnreadCount();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      // エラー時は再取得してバッジを再表示
      await fetchUnreadCount();
      fetchNotifications(null, false);
      throw error; // 呼び出し元にエラーを伝播
    }
  }, [fetchNotifications, fetchUnreadCount, refreshUnreadCount]);

  // お知らせ画面に入ったタイミングで未読を自動既読化
  useEffect(() => {
    if (!isNotificationsPage) return;
    if (isLoading) return;
    if (hasAutoMarkedReadOnNotificationsPage.current) return;
    if (unreadCount <= 0) return;

    const markAllReadOnPageEnter = async () => {
      try {
        await markAllRead();
        hasAutoMarkedReadOnNotificationsPage.current = true;
      } catch (error) {
        hasAutoMarkedReadOnNotificationsPage.current = false;
        console.error("Failed to auto mark notifications as read:", error);
      }
    };

    void markAllReadOnPageEnter();
  }, [isLoading, isNotificationsPage, markAllRead, unreadCount]);

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

      // 運営ボーナス通知はマイページへ遷移
      if (
        notification.type === "bonus" &&
        notification.data?.bonus_type &&
        [
          "admin_bonus",
          "streak",
          "daily_post",
          "signup_bonus",
          "referral",
          "tour_bonus",
        ].includes(notification.data.bonus_type)
      ) {
        router.push("/my-page");
        return;
      }

      // フォロー通知はフォローしてくれたユーザーのプロフィールへ遷移
      if (
        notification.type === "follow" &&
        notification.data?.follower_id
      ) {
        router.push(`/users/${notification.data.follower_id}?from=notifications`);
        return;
      }

      // 遷移
      if (notification.entity_type === "post") {
        router.push(`/posts/${notification.entity_id}?from=notifications`);
      } else if (notification.entity_type === "user") {
        router.push(`/users/${notification.entity_id}?from=notifications`);
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

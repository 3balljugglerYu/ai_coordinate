"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifications,
  getNotificationById,
  markNotificationsRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "../lib/api";
import type { Notification } from "../types";
import { isModerationNotificationType } from "../types";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import {
  formatNotificationContent,
  type NotificationTranslationKey,
} from "../lib/presentation";

export interface UseNotificationsInitialData {
  notifications: Notification[];
  nextCursor: string | null;
}
import { useToast } from "@/components/ui/use-toast";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";

interface UseNotificationsOptions {
  autoMarkAllRead?: boolean;
}

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
export function useNotifications(
  initialData?: UseNotificationsInitialData | null,
  options?: UseNotificationsOptions
) {
  const t = useTranslations("notifications");
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
  const autoMarkAllRead = options?.autoMarkAllRead ?? isNotificationsPage;

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

  const translateNotification = useCallback(
    (key: NotificationTranslationKey, values?: Record<string, string | number>) =>
      values ? t(key as never, values as never) : t(key as never),
    [t]
  );

  // Realtime の生の行には actor と post(サムネ) が付かず、実名表示の要件
  // (REQ-006) を満たせない。一覧へ入れる前に enrichment 済みの同じ通知を
  // API から取り直し、取れなかったときだけ生の行をそのまま出す。
  const prependRealtimeNotification = useCallback(
    async (rawNotification: Notification) => {
      let notificationToInsert = rawNotification;
      try {
        // ID 指定の単一取得。件数窓（直近N件）方式はバースト時に対象を
        // 取り逃がすため、必ず本人宛のその1件だけを引く。
        const enriched = await getNotificationById(rawNotification.id, {
          fetchFailed: t("fetchFailed"),
        });
        if (enriched) {
          notificationToInsert = enriched;
        }
      } catch (error) {
        console.error("Failed to enrich realtime notification:", error);
      }
      // enrichment の完了順に依存せず、API と同じ created_at DESC, id DESC を保つ
      setNotifications((prev) => {
        if (prev.some((item) => item.id === notificationToInsert.id)) {
          return prev;
        }
        return [notificationToInsert, ...prev].sort((a, b) => {
          const createdAtOrder =
            Date.parse(b.created_at) - Date.parse(a.created_at);
          return createdAtOrder || b.id.localeCompare(a.id);
        });
      });
    },
    [t]
  );

  /**
   * Realtime の UPDATE を一覧へ反映する。
   *
   * クリエイター還元通知は「受け手×JST日付で1行」を UPSERT で更新するため、
   * 2件目以降は INSERT ではなく UPDATE で届く。更新時は created_at も進むので、
   * 反映後に再ソートすると一覧の先頭へ浮上する。
   *
   * 既読化・一括既読も UPDATE を発火させる。ここで毎回 getNotificationById を
   * 呼ぶと一括既読で行数ぶんのリクエストが飛ぶため、一覧に既にある行は
   * DB 由来の列だけをマージして済ませる(enrichment 済みの actor / post は保持)。
   */
  /**
   * 購読が成立した時点（初回・再接続の両方）で最新ページを取り直し、
   * 取りこぼしを埋める。
   *
   * 初期取得〜購読成立の間や、切断中に古い還元通知が更新されて先頭側へ
   * 浮上すると、その UPDATE を受け取れない。しかも浮上後はカーソルより
   * 新しくなるので次ページ取得にも現れず、リロードするまで一覧に出ない。
   *
   * 単純な置き換えだと取得中に届いた Realtime の更新を巻き戻してしまうため、
   * ID 単位でマージし、created_at が新しい方を残す。
   */
  const reconcileLatestNotifications = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const response = await getNotifications(20, null, {
        fetchFailed: t("fetchFailed"),
      });

      setNotifications((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item]));
        for (const fetched of response.notifications) {
          const local = byId.get(fetched.id);
          if (
            local &&
            Date.parse(local.created_at) >= Date.parse(fetched.created_at)
          ) {
            continue;
          }
          byId.set(fetched.id, fetched);
        }
        return [...byId.values()].sort((a, b) => {
          const createdAtOrder =
            Date.parse(b.created_at) - Date.parse(a.created_at);
          return createdAtOrder || b.id.localeCompare(a.id);
        });
      });
    } catch (error) {
      console.error("Failed to reconcile notifications:", error);
    }
  }, [currentUserId, t]);

  const applyRealtimeNotificationUpdate = useCallback(
    (updated: Notification) => {
      setNotifications((prev) => {
        const index = prev.findIndex((item) => item.id === updated.id);
        if (index === -1) {
          // 一覧に無い行。ここへ来るのは主に「すべて既読にする」で
          // 未ロードの未読行が一斉に更新されたときなので、原則は無視する。
          // (取得しに行くと未読件数ぶんのリクエストが並び、しかも古い通知が
          //  一覧へ差し込まれてしまう)
          // 還元通知の未読だけは、気づかせる価値があるので差し込む。匿名で
          // actor / post の enrichment が不要なため、生の行をそのまま置ける。
          if (updated.type !== "usage_reward_earned" || updated.is_read) {
            return prev;
          }
          return [updated, ...prev].sort((a, b) => {
            const createdAtOrder =
              Date.parse(b.created_at) - Date.parse(a.created_at);
            return createdAtOrder || b.id.localeCompare(a.id);
          });
        }
        const merged: Notification = {
          ...prev[index],
          title: updated.title,
          body: updated.body,
          data: updated.data,
          is_read: updated.is_read,
          read_at: updated.read_at,
          created_at: updated.created_at,
        };
        const next = [...prev];
        next[index] = merged;
        return next.sort((a, b) => {
          const createdAtOrder =
            Date.parse(b.created_at) - Date.parse(a.created_at);
          return createdAtOrder || b.id.localeCompare(a.id);
        });
      });

    },
    []
  );

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
      const count = await getUnreadCount({
        unreadCountFailed: t("fetchUnreadFailed"),
      });
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, [currentUserId, t]);

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
        const response = await getNotifications(limit, cursor, {
          fetchFailed: t("fetchFailed"),
        });
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
    [currentUserId, t]
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
      const content = formatNotificationContent(
        latestBonusNotification,
        latestBonusNotification.actor?.nickname || t("userFallback"),
        translateNotification
      );
      toast({
        title: content.title,
        description: content.body,
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
    t,
    translateNotification,
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
          // 新規通知。バッジは即時、一覧の行は enrichment を経てから差し込む
          const newNotification = payload.new as Notification;
          setUnreadCount((prev) => prev + 1);
          void prependRealtimeNotification(newNotification);

          // ボーナス通知の場合はToastを表示
          if (
            !isNotificationsPage &&
            newNotification.type === "bonus" &&
            !hasShownBonusToast(newNotification)
          ) {
            const content = formatNotificationContent(
              newNotification,
              t("userFallback"),
              translateNotification
            );
            toast({
              title: content.title,
              description: content.body,
              variant: "default",
            });
            markBonusToastAsShown(newNotification);
            syncUnreadBadgeCount();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          // 内容の更新(還元通知の累計加算)と既読化の両方がここへ来る。
          // 未読バッジの同期は UnreadNotificationProvider が同じ UPDATE を
          // 購読して行うので、ここでは呼ばない(呼ぶと未読数APIが二重に走る)。
          applyRealtimeNotificationUpdate(payload.new as Notification);
        }
      )
      .subscribe((status) => {
        // 初回の購読成立時と再接続時に、購読ギャップぶんを埋める
        if (status === "SUBSCRIBED") {
          void reconcileLatestNotifications();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    currentUserId,
    hasShownBonusToast,
    isNotificationsPage,
    markBonusToastAsShown,
    applyRealtimeNotificationUpdate,
    prependRealtimeNotification,
    reconcileLatestNotifications,
    syncUnreadBadgeCount,
    toast,
    t,
    translateNotification,
  ]);

  // 通知を既読化
  const markRead = useCallback(
    async (ids: string[]) => {
      try {
        await markNotificationsRead(ids, {
          markReadFailed: t("markReadFailed"),
        });
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
    [fetchNotifications, fetchUnreadCount, refreshUnreadCount, t]
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
      await markAllNotificationsRead({
        markAllReadFailed: t("markAllReadFailed"),
      });
      // 成功時は楽観的更新で既に完了している
      await refreshUnreadCount();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      // エラー時は再取得してバッジを再表示
      await fetchUnreadCount();
      fetchNotifications(null, false);
      throw error; // 呼び出し元にエラーを伝播
    }
  }, [fetchNotifications, fetchUnreadCount, refreshUnreadCount, t]);

  // お知らせ画面に入ったタイミングで未読を自動既読化
  useEffect(() => {
    if (!autoMarkAllRead) return;
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
  }, [autoMarkAllRead, isLoading, markAllRead, unreadCount]);

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

      // モデレーション通知は判定詳細ページへ遷移する。
      // entity_type は 'post' だが、公開停止された投稿は本人でも /posts/{id} を
      // 開けないため、下の post 分岐より前に処理して死んだリンクを避ける
      // (ADR-008)。判定詳細は投稿が復帰した後も開ける。
      if (
        isModerationNotificationType(notification.type) &&
        notification.data?.moderation_decision_id
      ) {
        router.push(
          `/my-page/moderation/decisions/${notification.data.moderation_decision_id}?from=notifications`
        );
        return;
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

      // One-Tap Style の節目通知は対象プリセットの公開ページへ。
      // slug 欠損時は下の entity_type='user' 分岐（自分のプロフィール）へフォールバック。
      if (
        notification.type === "style_preset_usage_milestone" &&
        notification.data?.preset_slug
      ) {
        router.push(`/styles/${notification.data.preset_slug}`);
        return;
      }

      // クリエイター還元通知はペルコイン管理ページへ(残高が見える唯一の画面)。
      if (notification.type === "usage_reward_earned") {
        router.push("/my-page/credits");
        return;
      }

      // 遷移。コメント/返信通知は対象コメントへのディープリンクを付与し、
      // 投稿ページ側(CommentSection)が該当コメント・返信までスクロールする。
      if (notification.entity_type === "post") {
        const commentId = notification.data?.comment_id;
        const deepLink = commentId ? `&comment=${commentId}` : "";
        router.push(
          `/posts/${notification.entity_id}?from=notifications${deepLink}`
        );
      } else if (
        notification.entity_type === "comment" &&
        notification.data?.image_id
      ) {
        // comment 実体の entity_id は親コメントID(notify_on_comment 参照)。
        // data.comment_id は作成された返信自身のID。
        const parentId =
          notification.data?.parent_comment_id ?? notification.entity_id;
        const replyId = notification.data?.comment_id;
        const deepLink = `&comment=${parentId}${replyId ? `&reply=${replyId}` : ""}`;
        router.push(
          `/posts/${notification.data.image_id}?from=notifications${deepLink}`
        );
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

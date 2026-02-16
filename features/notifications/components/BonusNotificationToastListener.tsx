"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUser, onAuthStateChange } from "@/features/auth/lib/auth-client";
import { useToast } from "@/components/ui/use-toast";
import { getNotifications } from "@/features/notifications/lib/api";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import type { Notification } from "@/features/notifications/types";

const BONUS_TOAST_HISTORY_STORAGE_KEY = "bonus-toast-history:v2";
const BONUS_TOAST_HISTORY_LIMIT = 100;
const GLOBAL_BONUS_TOAST_TYPES = new Set([
  "signup_bonus",
  "referral",
  "admin_bonus",
  "tour_bonus",
]);

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

function isGlobalBonusToastTarget(notification: Notification): boolean {
  if (notification.type !== "bonus") return false;

  const bonusType = notification.data?.bonus_type;
  if (!bonusType) return false;

  return GLOBAL_BONUS_TOAST_TYPES.has(bonusType);
}

export function BonusNotificationToastListener() {
  const pathname = usePathname();
  const { toast } = useToast();
  const { unreadCount, refreshUnreadCount } = useUnreadNotificationCount();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const hasCheckedInitialBonusNotifications = useRef(false);
  const shownBonusToastSignaturesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then((user) => {
      if (!mounted) return;
      setCurrentUserId(user?.id || null);
      hasCheckedInitialBonusNotifications.current = false;
    });

    const subscription = onAuthStateChange((user) => {
      setCurrentUserId(user?.id || null);
      hasCheckedInitialBonusNotifications.current = false;
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const syncUnreadBadgeCount = useCallback(() => {
    void refreshUnreadCount().catch((error) => {
      console.error("Failed to sync unread badge count:", error);
    });
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!currentUserId) return;
    if (unreadCount <= 0) return;
    if (hasCheckedInitialBonusNotifications.current) return;

    let cancelled = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRetry = () => {
      if (retryCount < 3) {
        retryCount += 1;
        retryTimer = setTimeout(() => {
          void checkInitialUnreadBonusNotifications();
        }, 300 * retryCount);
      } else {
        hasCheckedInitialBonusNotifications.current = true;
      }
    };

    const checkInitialUnreadBonusNotifications = async (): Promise<void> => {
      try {
        const response = await getNotifications(20, null);
        if (cancelled) return;

        const unreadGlobalBonusNotifications = response.notifications.filter(
          (notification) =>
            !notification.is_read &&
            isGlobalBonusToastTarget(notification) &&
            !hasShownBonusToast(notification)
        );

        if (unreadGlobalBonusNotifications.length === 0) {
          scheduleRetry();
          return;
        }

        // お知らせ画面ではトーストを表示せず、履歴だけ記録
        if (pathname === "/notifications") {
          unreadGlobalBonusNotifications.forEach((notification) => {
            markBonusToastAsShown(notification);
          });
          hasCheckedInitialBonusNotifications.current = true;
          return;
        }

        const latestNotification = unreadGlobalBonusNotifications[0];
        toast({
          title: latestNotification.title,
          description: latestNotification.body,
          variant: "default",
        });
        markBonusToastAsShown(latestNotification);
        syncUnreadBadgeCount();

        hasCheckedInitialBonusNotifications.current = true;
      } catch (error) {
        console.error("Failed to check initial unread bonus notifications:", error);
        if (cancelled) return;

        scheduleRetry();
      }
    };

    void checkInitialUnreadBonusNotifications();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    currentUserId,
    hasShownBonusToast,
    markBonusToastAsShown,
    pathname,
    unreadCount,
    syncUnreadBadgeCount,
    toast,
  ]);

  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:bonus-toast:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          if (!isGlobalBonusToastTarget(newNotification)) return;
          if (hasShownBonusToast(newNotification)) return;

          if (pathname !== "/notifications") {
            toast({
              title: newNotification.title,
              description: newNotification.body,
              variant: "default",
            });
            syncUnreadBadgeCount();
          }

          markBonusToastAsShown(newNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    currentUserId,
    hasShownBonusToast,
    markBonusToastAsShown,
    pathname,
    syncUnreadBadgeCount,
    toast,
  ]);

  return null;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUser,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import { getUnreadCount } from "@/features/notifications/lib/api";
import {
  getAnnouncementUnreadState,
  markAnnouncementSeen,
} from "@/features/announcements/lib/api";
import type { AnnouncementUnreadState } from "@/features/announcements/lib/schema";

interface UnreadNotificationContextValue {
  unreadCount: number;
  hasAnnouncementPageDot: boolean;
  hasAnnouncementTabDot: boolean;
  hasSidebarDot: boolean;
  refreshUnreadCount: () => Promise<void>;
  refreshAnnouncementDots: () => Promise<void>;
  markAnnouncementPageSeen: () => Promise<void>;
  markAnnouncementTabSeen: () => Promise<void>;
}

const UnreadNotificationContext =
  createContext<UnreadNotificationContextValue | null>(null);

export function UnreadNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("notifications");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcementUnreadState, setAnnouncementUnreadState] =
    useState<AnnouncementUnreadState>({
      hasPageDot: false,
      hasTabDot: false,
      latestPublishedAt: null,
    });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnreadCountForUser = useCallback(async (userId: string | null) => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await getUnreadCount({
        unreadCountFailed: t("fetchUnreadFailed"),
      });
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread notification count:", error);
    }
  }, [t]);

  const fetchAnnouncementUnreadStateForUser = useCallback(
    async (userId: string | null) => {
      if (!userId) {
        setAnnouncementUnreadState({
          hasPageDot: false,
          hasTabDot: false,
          latestPublishedAt: null,
        });
        return;
      }

      try {
        const nextState = await getAnnouncementUnreadState({
          unreadStateFailed: t("announcementsUnreadStateFailed"),
        });
        setAnnouncementUnreadState(nextState);
      } catch (error) {
        console.error("Failed to fetch announcement unread state:", error);
      }
    },
    [t]
  );

  const scheduleUnreadCountRefresh = useCallback(
    (userId: string) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      // 複数イベント発火時の不要なAPI連打を抑制
      refreshTimerRef.current = setTimeout(() => {
        void fetchUnreadCountForUser(userId);
      }, 200);
    },
    [fetchUnreadCountForUser]
  );

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then((user) => {
      if (!mounted) return;
      const nextUserId = user?.id ?? null;
      setCurrentUserId(nextUserId);
      void fetchUnreadCountForUser(nextUserId);
      void fetchAnnouncementUnreadStateForUser(nextUserId);
    });

    const subscription = onAuthStateChange((user) => {
      const nextUserId = user?.id ?? null;
      setCurrentUserId(nextUserId);
      void fetchUnreadCountForUser(nextUserId);
      void fetchAnnouncementUnreadStateForUser(nextUserId);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAnnouncementUnreadStateForUser, fetchUnreadCountForUser]);

  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const userId = currentUserId;
    const channel = supabase
      .channel(`notifications:unread-count:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          scheduleUnreadCountRefresh(userId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          scheduleUnreadCountRefresh(userId);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [currentUserId, scheduleUnreadCountRefresh]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    void fetchAnnouncementUnreadStateForUser(currentUserId);

    const intervalId = window.setInterval(() => {
      void fetchAnnouncementUnreadStateForUser(currentUserId);
    }, 60_000);

    const handleWindowFocus = () => {
      void fetchAnnouncementUnreadStateForUser(currentUserId);
      void fetchUnreadCountForUser(currentUserId);
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [
    currentUserId,
    fetchAnnouncementUnreadStateForUser,
    fetchUnreadCountForUser,
  ]);

  const refreshUnreadCount = useCallback(async () => {
    await fetchUnreadCountForUser(currentUserId);
  }, [currentUserId, fetchUnreadCountForUser]);

  const refreshAnnouncementDots = useCallback(async () => {
    await fetchAnnouncementUnreadStateForUser(currentUserId);
  }, [currentUserId, fetchAnnouncementUnreadStateForUser]);

  const markAnnouncementPageSeen = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    setAnnouncementUnreadState((current) => ({
      ...current,
      hasPageDot: false,
    }));

    try {
      await markAnnouncementSeen("page", {
        markSeenFailed: t("announcementsMarkSeenFailed"),
      });
    } catch (error) {
      console.error("Failed to mark announcement page seen:", error);
      await fetchAnnouncementUnreadStateForUser(currentUserId);
    }
  }, [currentUserId, fetchAnnouncementUnreadStateForUser, t]);

  const markAnnouncementTabSeen = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    setAnnouncementUnreadState((current) => ({
      ...current,
      hasTabDot: false,
    }));

    try {
      await markAnnouncementSeen("tab", {
        markSeenFailed: t("announcementsMarkSeenFailed"),
      });
    } catch (error) {
      console.error("Failed to mark announcement tab seen:", error);
      await fetchAnnouncementUnreadStateForUser(currentUserId);
    }
  }, [currentUserId, fetchAnnouncementUnreadStateForUser, t]);

  const value = useMemo(
    () => ({
      unreadCount,
      hasAnnouncementPageDot: announcementUnreadState.hasPageDot,
      hasAnnouncementTabDot: announcementUnreadState.hasTabDot,
      hasSidebarDot:
        unreadCount > 0 || announcementUnreadState.hasPageDot,
      refreshUnreadCount,
      refreshAnnouncementDots,
      markAnnouncementPageSeen,
      markAnnouncementTabSeen,
    }),
    [
      announcementUnreadState.hasPageDot,
      announcementUnreadState.hasTabDot,
      markAnnouncementPageSeen,
      markAnnouncementTabSeen,
      refreshAnnouncementDots,
      refreshUnreadCount,
      unreadCount,
    ]
  );

  return (
    <UnreadNotificationContext.Provider value={value}>
      {children}
    </UnreadNotificationContext.Provider>
  );
}

export function useUnreadNotificationCount() {
  const context = useContext(UnreadNotificationContext);
  if (!context) {
    throw new Error(
      "useUnreadNotificationCount must be used within UnreadNotificationProvider"
    );
  }
  return context;
}

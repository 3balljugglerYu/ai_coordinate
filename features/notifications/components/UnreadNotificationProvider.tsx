"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUser,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import { getUnreadCount } from "@/features/notifications/lib/api";

interface UnreadNotificationContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
}

const UnreadNotificationContext =
  createContext<UnreadNotificationContextValue | null>(null);

export function UnreadNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCountForUser = useCallback(async (userId: string | null) => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread notification count:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then((user) => {
      if (!mounted) return;
      const nextUserId = user?.id ?? null;
      setCurrentUserId(nextUserId);
      void fetchUnreadCountForUser(nextUserId);
    });

    const subscription = onAuthStateChange((user) => {
      const nextUserId = user?.id ?? null;
      setCurrentUserId(nextUserId);
      void fetchUnreadCountForUser(nextUserId);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUnreadCountForUser]);

  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:unread-count:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        () => {
          void fetchUnreadCountForUser(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchUnreadCountForUser]);

  const refreshUnreadCount = useCallback(async () => {
    await fetchUnreadCountForUser(currentUserId);
  }, [currentUserId, fetchUnreadCountForUser]);

  const value = useMemo(
    () => ({
      unreadCount,
      refreshUnreadCount,
    }),
    [unreadCount, refreshUnreadCount]
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

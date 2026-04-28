"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChange } from "@/features/auth/lib/auth-client";
import {
  getChallengeStatus,
  type ChallengeStatus,
} from "@/features/challenges/lib/api";
import { isSameJstDate } from "@/features/challenges/lib/streak-utils";

const SNOOZE_KEY_PREFIX = "missionTabDot:snoozedUntil:";
const SNOOZE_TTL_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 60_000;

interface MissionDotContextValue {
  missionStatus: ChallengeStatus | null;
  hasMissionTabDot: boolean;
  hasCheckInDot: boolean;
  hasDailyPostDot: boolean;
  refreshMissionDots: () => Promise<void>;
  markMissionTabSnoozed: () => void;
}

const MissionDotContext = createContext<MissionDotContextValue | null>(null);

function snoozeKeyFor(userId: string): string {
  return `${SNOOZE_KEY_PREFIX}${userId}`;
}

function readSnoozedUntil(userId: string | null): number | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(snoozeKeyFor(userId));
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSnoozedUntil(userId: string | null, value: number | null): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = snoozeKeyFor(userId);
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(value));
    }
  } catch {
    // storage が使えない環境では無視する
  }
}

export function MissionDotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<ChallengeStatus | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const fetchStatus = useCallback(async (userId: string | null) => {
    if (!userId) {
      setStatus(null);
      return;
    }
    try {
      const next = await getChallengeStatus();
      setStatus(next);
    } catch (error) {
      console.error("Failed to fetch challenge status for mission dots:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const subscription = onAuthStateChange((user) => {
      if (!mounted) return;
      const nextUserId = user?.id ?? null;
      setCurrentUserId(nextUserId);
      setSnoozedUntil(readSnoozedUntil(nextUserId));
      void fetchStatus(nextUserId);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (!currentUserId) return;

    const intervalId = window.setInterval(() => {
      void fetchStatus(currentUserId);
      setNow(Date.now());
    }, POLL_INTERVAL_MS);

    const handleFocus = () => {
      void fetchStatus(currentUserId);
      setNow(Date.now());
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [currentUserId, fetchStatus]);

  const refreshMissionDots = useCallback(async () => {
    setNow(Date.now());
    await fetchStatus(currentUserId);
  }, [currentUserId, fetchStatus]);

  const markMissionTabSnoozed = useCallback(() => {
    if (!currentUserId) return;
    const until = Date.now() + SNOOZE_TTL_MS;
    setSnoozedUntil(until);
    writeSnoozedUntil(currentUserId, until);
  }, [currentUserId]);

  const value = useMemo<MissionDotContextValue>(() => {
    if (!currentUserId || !status) {
      return {
        missionStatus: null,
        hasMissionTabDot: false,
        hasCheckInDot: false,
        hasDailyPostDot: false,
        refreshMissionDots,
        markMissionTabSnoozed,
      };
    }

    const nowDate = new Date(now);
    const isCheckedInToday = isSameJstDate(
      status.lastStreakLoginAt,
      nowDate
    );
    const isDailyBonusReceived = isSameJstDate(
      status.lastDailyPostBonusAt,
      nowDate
    );
    const hasIncompleteTask = !isCheckedInToday || !isDailyBonusReceived;
    const isSnoozed = snoozedUntil !== null && now < snoozedUntil;

    return {
      missionStatus: status,
      hasMissionTabDot: hasIncompleteTask && !isSnoozed,
      hasCheckInDot: !isCheckedInToday,
      hasDailyPostDot: !isDailyBonusReceived,
      refreshMissionDots,
      markMissionTabSnoozed,
    };
  }, [
    currentUserId,
    status,
    snoozedUntil,
    now,
    refreshMissionDots,
    markMissionTabSnoozed,
  ]);

  return (
    <MissionDotContext.Provider value={value}>
      {children}
    </MissionDotContext.Provider>
  );
}

export function useMissionDots(): MissionDotContextValue {
  const context = useContext(MissionDotContext);
  if (!context) {
    throw new Error("useMissionDots must be used within MissionDotProvider");
  }
  return context;
}

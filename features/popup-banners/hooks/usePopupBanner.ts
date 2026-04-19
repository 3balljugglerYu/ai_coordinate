"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCurrentUser,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import {
  buildPopupBannerHistoryEntry,
  buildPopupBannerHistoryMap,
  parsePopupBannerHistory,
  POPUP_BANNER_HISTORY_STORAGE_KEY,
  selectNextPopupBanner,
  serializePopupBannerHistory,
} from "@/features/popup-banners/lib/popup-banner-display-logic";
import type {
  ActivePopupBanner,
  PopupBannerActionType,
  PopupBannerHistoryMap,
  PopupBannerViewRecord,
} from "@/features/popup-banners/lib/schema";

const POPUP_BANNER_IMPRESSION_SESSION_KEY = "popup-banner-impressions-v1";

type HistoryMode = "local" | "remote";

function readLocalHistory(): PopupBannerHistoryMap {
  if (typeof window === "undefined") {
    return {};
  }

  return parsePopupBannerHistory(
    window.localStorage.getItem(POPUP_BANNER_HISTORY_STORAGE_KEY)
  );
}

function writeLocalHistory(history: PopupBannerHistoryMap) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    POPUP_BANNER_HISTORY_STORAGE_KEY,
    serializePopupBannerHistory(history)
  );
}

function readSentImpressionIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  const rawValue = window.sessionStorage.getItem(
    POPUP_BANNER_IMPRESSION_SESSION_KEY
  );
  if (!rawValue) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(rawValue) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeSentImpressionIds(ids: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    POPUP_BANNER_IMPRESSION_SESSION_KEY,
    JSON.stringify(Array.from(ids))
  );
}

async function loadRemoteHistory(): Promise<{
  history: PopupBannerHistoryMap;
  mode: HistoryMode;
}> {
  try {
    const response = await fetch("/api/popup-banners/view-history", {
      cache: "no-store",
    });

    if (response.status === 401) {
      return {
        history: readLocalHistory(),
        mode: "local",
      };
    }

    if (!response.ok) {
      throw new Error("Failed to load popup banner history");
    }

    const payload = (await response.json()) as PopupBannerViewRecord[];
    return {
      history: buildPopupBannerHistoryMap(payload),
      mode: "remote",
    };
  } catch {
    return {
      history: readLocalHistory(),
      mode: "local",
    };
  }
}

async function postInteraction(
  bannerId: string,
  actionType: PopupBannerActionType
) {
  await fetch("/api/popup-banners/interact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      banner_id: bannerId,
      action_type: actionType,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

interface UsePopupBannerResult {
  currentBanner: ActivePopupBanner | null;
  isReady: boolean;
  closeBanner: (dismissForever?: boolean) => void;
  clickBanner: () => void;
  markBannerDisplayed: (bannerId: string) => void;
}

export function usePopupBanner(
  banners: ActivePopupBanner[]
): UsePopupBannerResult {
  const [history, setHistory] = useState<PopupBannerHistoryMap>({});
  const [historyMode, setHistoryMode] = useState<HistoryMode>("local");
  const [currentBanner, setCurrentBanner] = useState<ActivePopupBanner | null>(
    null
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const sentImpressionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    sentImpressionIdsRef.current = readSentImpressionIds();
  }, []);

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then((user) => {
      if (!mounted) {
        return;
      }

      setIsAuthenticated(Boolean(user));
    });

    const subscription = onAuthStateChange((user) => {
      setIsAuthenticated(Boolean(user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated === null) {
      return;
    }

    let cancelled = false;

    async function initialize() {
      setIsReady(false);

      const resolved = isAuthenticated
        ? await loadRemoteHistory()
        : {
            history: readLocalHistory(),
            mode: "local" as const,
          };
      if (cancelled) {
        return;
      }

      setHistory(resolved.history);
      setHistoryMode(resolved.mode);
      setCurrentBanner((previousBanner) => {
        if (
          previousBanner &&
          banners.some((banner) => banner.id === previousBanner.id)
        ) {
          return previousBanner;
        }

        return selectNextPopupBanner(banners, resolved.history);
      });
      setIsReady(true);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [banners, isAuthenticated]);

  const markBannerDisplayed = useCallback(
    (bannerId: string) => {
      if (currentBanner?.id !== bannerId) {
        return;
      }

      const sentIds = sentImpressionIdsRef.current;
      if (sentIds.has(bannerId)) {
        return;
      }

      sentIds.add(bannerId);
      writeSentImpressionIds(sentIds);

      setHistory((currentHistory) => {
        const nextHistory = {
          ...currentHistory,
          [bannerId]: buildPopupBannerHistoryEntry("impression"),
        };

        if (historyMode === "local") {
          writeLocalHistory(nextHistory);
        }

        return nextHistory;
      });

      if (isAuthenticated) {
        void postInteraction(bannerId, "impression");
      }
    },
    [currentBanner?.id, historyMode, isAuthenticated]
  );

  function applyAction(actionType: PopupBannerActionType) {
    if (!currentBanner) {
      return;
    }

    const nextHistory = {
      ...history,
      [currentBanner.id]: buildPopupBannerHistoryEntry(actionType),
    };

    setHistory(nextHistory);
    if (historyMode === "local") {
      writeLocalHistory(nextHistory);
    }

    if (actionType === "click") {
      setCurrentBanner(null);
    } else {
      setCurrentBanner(selectNextPopupBanner(banners, nextHistory));
    }

    if (isAuthenticated) {
      void postInteraction(currentBanner.id, actionType);
    }
  }

  return {
    currentBanner,
    isReady,
    closeBanner: (dismissForever = false) =>
      applyAction(dismissForever ? "dismiss_forever" : "close"),
    clickBanner: () => applyAction("click"),
    markBannerDisplayed,
  };
}

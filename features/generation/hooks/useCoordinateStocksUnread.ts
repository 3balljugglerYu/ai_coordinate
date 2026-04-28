"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStocksTabUnreadState,
  markStocksTabSeen,
  type StocksTabUnreadState,
} from "../lib/database";

const STOCK_CREATED_EVENT = "coordinate-stock-created";

/**
 * /coordinate のストックタブに付与する未確認赤丸ドットの状態管理。
 *
 * - マウント時に GET /api/coordinate/stocks-unread-state を呼んで初期値を取得
 * - `markSeen()` で楽観的に false にしつつ POST /api/coordinate/stocks-tab-seen
 * - window focus / visibilitychange / `coordinate-stock-created` イベントで refetch
 *
 * 認証エラー時は `hasDot: false` を返す（API 側の規約と揃える）。
 */
export function useCoordinateStocksUnread(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [hasDot, setHasDot] = useState(false);
  const [latestStockCreatedAt, setLatestStockCreatedAt] = useState<string | null>(
    null
  );
  const isFetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const state: StocksTabUnreadState = await getStocksTabUnreadState();
      setHasDot(state.hasDot);
      setLatestStockCreatedAt(state.latestStockCreatedAt);
    } catch (error) {
      console.error("[useCoordinateStocksUnread] refresh failed:", error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [enabled]);

  const markSeen = useCallback(async () => {
    if (!enabled) return;
    setHasDot(false);
    try {
      await markStocksTabSeen();
    } catch (error) {
      console.error("[useCoordinateStocksUnread] mark seen failed:", error);
      // ロールバック: refetch して整合性を取り戻す
      await refresh();
    }
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const handleFocus = () => {
      void refresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    const handleStockCreated = () => {
      void refresh();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(STOCK_CREATED_EVENT, handleStockCreated);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(STOCK_CREATED_EVENT, handleStockCreated);
    };
  }, [enabled, refresh]);

  return {
    hasDot,
    latestStockCreatedAt,
    markSeen,
    refresh,
  };
}

export const COORDINATE_STOCK_CREATED_EVENT = STOCK_CREATED_EVENT;

"use client";

import { useEffect } from "react";
import {
  FIRST_VISIT_COOKIE,
  FIRST_VISIT_COOKIE_MAX_AGE_SECONDS,
  detectFirstVisitChannel,
  normalizeLandingPath,
  readFirstVisitFromCookieHeader,
  serializeFirstVisit,
} from "@/features/auth/lib/first-visit";

/**
 * はじめてペルスタに来たとき、来た場所と最初に開いた画面を cookie に残す(管理ダッシュボード P3-3)。
 * すでに残っていれば何もしない(最初の訪問を尊重)。表示は何もしない。
 * 登録のときに user_first_visits へ書く(features/auth/lib/first-visit.ts)。
 */
export function FirstVisitCapture() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (readFirstVisitFromCookieHeader(document.cookie)) return;
    const value = serializeFirstVisit({
      channel: detectFirstVisitChannel({
        search: window.location.search,
        userAgent: window.navigator.userAgent,
        referrer: document.referrer,
        siteHost: window.location.hostname,
      }),
      landingPath: normalizeLandingPath(window.location.pathname),
    });
    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent(
      value
    )}; path=/; max-age=${FIRST_VISIT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }, []);

  return null;
}

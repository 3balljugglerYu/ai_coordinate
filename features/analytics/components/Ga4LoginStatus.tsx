"use client";

import { useEffect } from "react";
import {
  getCurrentUser,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 の user property `logged_in` を設定し、以降の page_view にログイン状態を付与する。
 * これにより将来 BigQuery 側で「ログイン / 未ログイン」別の DAU/MAU 集計が可能になる
 * (計測を追加した日以降のデータのみ・過去は遡及不可)。
 *
 * `gtag('set','user_properties',...)` は sticky なので、初回マウント時と
 * ログイン状態の変化時に都度設定する。UnreadNotificationProvider と同じく
 * getCurrentUser + onAuthStateChange を購読する。
 */
function setLoggedInProperty(loggedIn: boolean) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("set", "user_properties", {
    logged_in: loggedIn ? "yes" : "no",
  });
}

export function Ga4LoginStatus() {
  useEffect(() => {
    let mounted = true;

    void getCurrentUser().then((user) => {
      if (!mounted) {
        return;
      }
      setLoggedInProperty(Boolean(user));
    });

    const subscription = onAuthStateChange((user) => {
      setLoggedInProperty(Boolean(user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}

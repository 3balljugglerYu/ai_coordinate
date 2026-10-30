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
 * GA4 に、ログイン状態(user property `logged_in`)と、ログインしている人のユーザー ID を設定し、
 * 以降の page_view などに付与する。
 *
 * - `logged_in`: BigQuery 側で「ログイン / 未ログイン」別の DAU/MAU を集計するため
 *   (計測を追加した日以降のデータのみ・過去は遡及不可)。
 * - `user_id`: GA4 の生データ(BigQuery)で、登録前の訪問(user_pseudo_id)と登録後の利用を
 *   結ぶため(管理ダッシュボード P3-4・docs/planning/admin-growth-p3-instrumentation-plan.md 6章)。
 *   送るのは当サービスの中だけで使う ID で、メールアドレスなど個人が分かるものは送らない
 *   (プライバシーポリシー・外部送信のページに記載済み)。ログアウトしたら null に戻す。
 *   登録・生成・課金の出来事は GA4 に送らず、DB を正とする。
 *
 * `gtag('set', ...)` は以降の送信に残り続けるので、初回マウント時と
 * ログイン状態の変化時に都度設定する。UnreadNotificationProvider と同じく
 * getCurrentUser + onAuthStateChange を購読する。
 */
function setGa4UserIdentity(userId: string | null) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("set", "user_properties", {
    logged_in: userId ? "yes" : "no",
  });
  window.gtag("set", { user_id: userId });
}

export function Ga4LoginStatus() {
  useEffect(() => {
    let mounted = true;

    void getCurrentUser().then((user) => {
      if (!mounted) {
        return;
      }
      setGa4UserIdentity(user?.id ?? null);
    });

    const subscription = onAuthStateChange((user) => {
      setGa4UserIdentity(user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}

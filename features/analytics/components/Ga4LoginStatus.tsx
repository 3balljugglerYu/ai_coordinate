"use client";

import { useEffect } from "react";
import { useAuthUser } from "@/features/auth/hooks/use-auth-user";
import { publicEnv } from "@/lib/public-env";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
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
 *   送るのは当サービスの中で使う ID で、メールアドレスなど個人が分かるものは送らない
 *   (プライバシーポリシー・外部送信のページに記載済み)。ログアウトしたら null に戻す。
 *   登録・生成・課金の出来事は GA4 に送らず、DB を正とする。
 *
 * ログイン状態は useAuthUser で決める。確認の失敗や初回通知の null を「未ログイン」と
 * 取り違えたり、ログアウトのあとに古い確認の結果で前の人の ID に戻したりしないため。
 * 確認が終わるまで(loading)は何も設定しない。
 */
function gtagCommand(...args: unknown[]) {
  if (typeof window.gtag === "function") {
    window.gtag(...args);
    return;
  }
  // gtag.js の読み込み前なら、Ga4Script と同じ形(arguments)で並べておく。
  // 読み込まれたあとに、並んだ順に処理される(捨てると、このページではずっと付かない)。
  window.dataLayer = window.dataLayer || [];
  (function queue() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as (...queued: unknown[]) => void)(...args);
}

function setGa4UserIdentity(userId: string | null) {
  gtagCommand("set", "user_properties", {
    logged_in: userId ? "yes" : "no",
  });
  gtagCommand("set", { user_id: userId });
}

function Ga4LoginStatusTracker() {
  const auth = useAuthUser();
  const userId = auth.status === "signed-in" ? auth.user.id : null;

  useEffect(() => {
    if (auth.status === "loading") {
      return;
    }
    setGa4UserIdentity(userId);
  }, [auth.status, userId]);

  return null;
}

/** GA4 の測定 ID が無い環境(手元・プレビュー)では、ログイン状態の確認もしない */
export function Ga4LoginStatus() {
  if (!publicEnv.NEXT_PUBLIC_GA4_MEASUREMENT_ID) {
    return null;
  }
  return <Ga4LoginStatusTracker />;
}

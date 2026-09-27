"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  onAuthStateChange,
  resolveCurrentUser,
} from "@/features/auth/lib/auth-client";

export type AuthUserState =
  | { status: "loading"; user: null }
  | { status: "signed-in"; user: User }
  | { status: "signed-out"; user: null };

const LOADING: AuthUserState = { status: "loading", user: null };
const SIGNED_OUT: AuthUserState = { status: "signed-out", user: null };

/** 確認に失敗したときの取り直し間隔。失敗が続くほど倍にし、上限で止める */
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60_000;

/**
 * 表示に使うログイン状態(ヘッダー・サイドバー)。
 *
 * 以前は確認の失敗(タブ間ロック待ち・通信失敗)を「未ログイン」と取り違え、
 * ログイン中なのに「ログイン」ボタンを出したまま、画面遷移しても戻らなかった
 * (2026-09-27)。ここでは次の約束で状態を決める。
 *
 * - 初期状態はサーバーへの確認(resolveCurrentUser)で決める。確認できなかった
 *   (unknown)間は loading のまま取り直す。裏から戻ったら待たずに取り直す
 * - 初回通知(INITIAL_SESSION)は使わない。手元の Cookie を読んだだけで、
 *   null は「セッションが無い」と「読めなかった」を区別できない
 * - それ以外の通知(ログイン・ログアウト・トークン更新)は常に優先する。
 *   通知より前に始めた確認の結果は捨て、取り直しもやめる
 */
export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>(LOADING);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    // 通知が届くたびに進める。確認は開始時の値と比べ、古ければ結果を捨てる
    let notificationCount = 0;

    const cancelRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const check = async () => {
      cancelRetry();
      const startedAt = notificationCount;
      const result = await resolveCurrentUser();
      if (!active || startedAt !== notificationCount) {
        return;
      }

      if (result.status === "unknown") {
        const delay = Math.min(RETRY_BASE_MS * 2 ** failures, RETRY_MAX_MS);
        failures += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void check();
        }, delay);
        return;
      }

      failures = 0;
      setState(
        result.status === "signed-in"
          ? { status: "signed-in", user: result.user }
          : SIGNED_OUT
      );
    };

    const handleVisibilityChange = () => {
      // 取り直し待ちのまま表に戻ってきたら、待たずに確かめる
      if (document.visibilityState === "visible" && retryTimer) {
        void check();
      }
    };

    const subscription = onAuthStateChange((user, event) => {
      if (!active || event === "INITIAL_SESSION") {
        return;
      }
      notificationCount += 1;
      cancelRetry();
      failures = 0;
      setState(user ? { status: "signed-in", user } : SIGNED_OUT);
    });

    void check();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      cancelRetry();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

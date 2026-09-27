import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";

/**
 * 認証処理をタブ間で待ち合わせないためのロック関数。
 *
 * supabase-js 2.90 の既定では、全タブの認証処理をブラウザの Web Locks
 * (navigator.locks)で1つずつ実行し、待ちが10秒を超えると失敗する。裏に回った
 * タブが通信の途中で止まるとロックを握ったままになり、他のタブは起動時の初期化から
 * 失敗し続けた(ヘッダーが「ログイン」に化け、ログアウトも Supabase に届かない。
 * 2026-09-27)。上流も v2.107.0 でこのロックを既定で廃止している。
 *
 * ⭐ 処理はその場で(同期的に)呼ぶこと。auth-js は、ロック関数が処理を同期的に
 * 始めることを前提に、同じタブの中の処理を自前の待ち行列で1つずつに並べている
 * (GoTrueClient._acquireLock の lockAcquired)。後回しにすると同時に走り出す。
 * タブをまたいだトークン更新の競合は、Supabase Auth 側(使用済みトークンの親子判定)で解決される。
 */
async function runWithoutCrossTabLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  return await fn();
}

/**
 * ブラウザ用Supabaseクライアント
 * NEXT_PUBLIC_*環境変数を使用
 */
export function createClient() {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables."
    );
  }

  return createBrowserClient(url, anonKey, {
    auth: { lock: runWithoutCrossTabLock },
  });
}

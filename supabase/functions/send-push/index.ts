// ===============================================
// send-push Edge Function
// ===============================================
// push_outbox の送る時刻を過ぎた行を確保し、FCM でアプリへプッシュ通知を送る。
//
// 起動: push_outbox_kick() が pg_cron(10 秒ごと)と生成完了のトリガーから
//        net.http_post で叩く(送る行がある時だけ)。
// 認可: verify_jwt = false(config.toml)+ 関数内で PUSH_SEND_SECRET を
//        Authorization ヘッダ照合(cleanup-temp-images と同じ。秘密は本機能専用)。
// 流れ: claim_push_outbox → 受け手の設定(push_allowed_now)で送らないものは skipped
//        → 同じ宛先・同じ collapse_key(いいね)は 1 通にまとめる → 端末ごとに FCM へ
//        → 使えない宛先は push_device_tokens から消す → finish_push_outbox で記録。
//        流れの本体は process.ts(Jest でテストする)。
// 冪等性: 確保は FOR UPDATE SKIP LOCKED。途中で例外が出ても、そこまでの結果と
//        「送る前に止まった行は retry」を必ず記録する。関数ごと止められた時だけ
//        processing のまま残り、5 分後に再確保される(確保は 5 回まで)。
//
// 動かす順(秘密の登録順):
//   1. 20261013120000 / 20261013120100 のマイグレーションを本番に適用する
//   2. send-push をデプロイし、秘密 FCM_SERVICE_ACCOUNT_JSON と PUSH_SEND_SECRET を登録する
//   3. 最後に Vault に push_send_secret(PUSH_SEND_SECRET と同じ値)を登録する。
//      ここから push_outbox_kick が send-push を起こし始める
//   FCM の鍵より先に Vault を登録すると、鍵が入るまで、送る行がある限り 10 秒ごとに
//   503(fcm_not_configured)が返り続ける(害は無いがログが埋まる)。
//
// 計画書: docs/planning/push-notifications-implementation-plan.md Phase 2

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  getAccessToken,
  parseServiceAccount,
  resetAccessTokenCache,
  type ServiceAccount,
} from "./fcm-auth.ts";
import {
  type ClaimedRow,
  classifyFcmResponse,
  type FcmOutcome,
  type PushImageSource,
} from "./messages.ts";
import { type ImageQueryClient, lookupPushImageUrl } from "./images.ts";
import {
  type DeviceRow,
  type FcmSender,
  type PushStore,
  runSendPush,
} from "./process.ts";

// FCM への 1 件の送信を待つ上限。応答が無いまま関数の時間を使い切らないように
const FCM_REQUEST_TIMEOUT_MS = 10_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // 送信は利用者の端末に届くので、秘密が無い時は動かさない
  const secret = Deno.env.get("PUSH_SEND_SECRET");
  if (!secret) {
    console.error("[send-push] PUSH_SEND_SECRET is not set");
    return json(500, { error: "missing_env" });
  }
  if ((req.headers.get("Authorization") || "") !== `Bearer ${secret}`) {
    console.warn("[send-push] Authorization mismatch");
    return json(401, { error: "unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[send-push] Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return json(500, { error: "missing_env" });
  }

  // 鍵が無い間は確保しない(行は pending のまま残り、鍵の登録後に送られる)
  const account = parseServiceAccount(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"));
  if (!account) {
    console.error("[send-push] FCM_SERVICE_ACCOUNT_JSON is missing or invalid");
    return json(503, { error: "fcm_not_configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await runSendPush(createStore(supabase, supabaseUrl), createSender(account));
  if (!result.ok) {
    return json(500, { error: result.error, totals: result.totals });
  }

  console.log("[send-push] done", JSON.stringify(result.totals));
  return json(200, result.totals);
});

function createStore(supabase: SupabaseClient, supabaseUrl: string): PushStore {
  return {
    async claim(limit) {
      const { data, error } = await supabase.rpc("claim_push_outbox", { p_limit: limit });
      return { rows: (data ?? []) as ClaimedRow[], error: error?.message ?? null };
    },
    async finish(results) {
      const { error } = await supabase.rpc("finish_push_outbox", { p_results: results });
      return { error: error?.message ?? null };
    },
    async allowedNow(userId, category) {
      const { data, error } = await supabase.rpc("push_allowed_now", {
        p_user_id: userId,
        p_category: category,
      });
      return { allowed: data === true, error: error?.message ?? null };
    },
    async devices(userIds) {
      const { data, error } = await supabase
        .from("push_device_tokens")
        .select("id, user_id, token")
        .in("user_id", userIds);
      return { devices: (data ?? []) as DeviceRow[], error: error?.message ?? null };
    },
    async unreadCount(userId) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false);
      return error ? null : count ?? null;
    },
    async unreadLikeCount(userId, entityId) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("type", "like")
        .eq("entity_id", entityId)
        .eq("is_read", false);
      return error ? null : count ?? null;
    },
    async nickname(userId) {
      const { data } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as { nickname?: string | null } | null)?.nickname ?? null;
    },
    imageUrl(source: PushImageSource) {
      // supabase-js の型を ImageQueryClient に当てはめると型の展開が深すぎて止まるので、
      // 使う分だけの形として渡す(images.ts は Jest でも読むため supabase-js に依存しない)
      return lookupPushImageUrl(supabase as unknown as ImageQueryClient, supabaseUrl, source);
    },
    async removeTokens(tokens) {
      const { count, error } = await supabase
        .from("push_device_tokens")
        .delete({ count: "exact" })
        .in("token", tokens);
      return { removed: count ?? 0, error: error?.message ?? null };
    },
  };
}

function createSender(account: ServiceAccount): FcmSender {
  return {
    getAccessToken: () => getAccessToken(account),
    resetAccessToken: () => resetAccessTokenCache(),
    async send(accessToken, message): Promise<FcmOutcome> {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
            signal: AbortSignal.timeout(FCM_REQUEST_TIMEOUT_MS),
          },
        );
        const body = await res.json().catch(() => null);
        return classifyFcmResponse(res.status, body);
      } catch (e) {
        // 通信の失敗・待ち時間切れは一時的なものとしてやり直す
        return { kind: "retry", error: `network: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}

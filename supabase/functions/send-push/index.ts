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
// 冪等性: 確保は FOR UPDATE SKIP LOCKED。途中で落ちても 5 分後に再確保される。
//
// 計画書: docs/planning/push-notifications-implementation-plan.md Phase 2

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getAccessToken, parseServiceAccount, type ServiceAccount } from "./fcm-auth.ts";
import {
  buildDataPayload,
  buildFcmMessage,
  buildLikeTitle,
  type ClaimedRow,
  classifyFcmResponse,
  type FcmOutcome,
  groupRows,
  type PushGroup,
  resolveText,
  summarizeOutcomes,
} from "./messages.ts";

const CLAIM_LIMIT = 100;
// 1 回の呼び出しで回す確保の上限(暴走防止)。残りは次の起動で送る
const MAX_BATCHES = 5;

interface DeviceRow {
  id: string;
  user_id: string;
  token: string;
}

interface FinishItem {
  id: string;
  status: "sent" | "skipped" | "failed" | "retry";
  error?: string | null;
}

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

  const totals = { claimed: 0, sent: 0, skipped: 0, failed: 0, retry: 0, removedTokens: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await supabase.rpc("claim_push_outbox", { p_limit: CLAIM_LIMIT });
    if (error) {
      console.error("[send-push] claim_push_outbox failed:", error.message);
      return json(500, { error: "claim_failed", totals });
    }
    const rows = (data ?? []) as ClaimedRow[];
    if (rows.length === 0) break;
    totals.claimed += rows.length;

    const results = await processRows(supabase, account, rows, totals);

    const { error: finishError } = await supabase.rpc("finish_push_outbox", {
      p_results: results,
    });
    if (finishError) {
      // 記録できなかった行は 5 分後に再確保される(二重送信になりうるが取りこぼすよりよい)
      console.error("[send-push] finish_push_outbox failed:", finishError.message);
      return json(500, { error: "finish_failed", totals });
    }
    for (const r of results) totals[r.status] += 1;

    if (rows.length < CLAIM_LIMIT) break;
  }

  console.log("[send-push] done", JSON.stringify(totals));
  return json(200, totals);
});

async function processRows(
  supabase: SupabaseClient,
  account: ServiceAccount,
  rows: ClaimedRow[],
  totals: { removedTokens: number },
): Promise<FinishItem[]> {
  const results: FinishItem[] = [];

  // 1. 受け手の設定で送らないものを除く(種類オフ・一時停止・止める時間帯)
  const allowedCache = new Map<string, boolean>();
  const allowedRows: ClaimedRow[] = [];
  for (const row of rows) {
    const key = `${row.recipient_id}:${row.category}`;
    let allowed = allowedCache.get(key);
    if (allowed === undefined) {
      const { data, error } = await supabase.rpc("push_allowed_now", {
        p_user_id: row.recipient_id,
        p_category: row.category,
      });
      if (error) {
        console.error("[send-push] push_allowed_now failed:", error.message);
        results.push({ id: row.id, status: "retry", error: `allowed_check: ${error.message}` });
        continue;
      }
      allowed = data === true;
      allowedCache.set(key, allowed);
    }
    if (allowed) {
      allowedRows.push(row);
    } else {
      results.push({ id: row.id, status: "skipped", error: "preference" });
    }
  }
  if (allowedRows.length === 0) return results;

  const groups = groupRows(allowedRows);
  const recipientIds = [...new Set(groups.map((g) => g.recipientId))];

  // 2. 宛先(端末)
  const { data: deviceData, error: deviceError } = await supabase
    .from("push_device_tokens")
    .select("id, user_id, token")
    .in("user_id", recipientIds);
  if (deviceError) {
    console.error("[send-push] device lookup failed:", deviceError.message);
    for (const g of groups) {
      for (const id of g.rowIds) {
        results.push({ id, status: "retry", error: `devices: ${deviceError.message}` });
      }
    }
    return results;
  }
  const devicesByUser = new Map<string, DeviceRow[]>();
  for (const d of (deviceData ?? []) as DeviceRow[]) {
    const list = devicesByUser.get(d.user_id) ?? [];
    list.push(d);
    devicesByUser.set(d.user_id, list);
  }

  // 3. iOS のバッジに出す未読数(受け手ごとに 1 回)
  const badges = new Map<string, number | null>();
  for (const userId of recipientIds) {
    if (!devicesByUser.has(userId)) continue;
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);
    badges.set(userId, error ? null : count ?? null);
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[send-push] access token failed:", message);
    for (const g of groups) {
      for (const id of g.rowIds) results.push({ id, status: "retry", error: message });
    }
    return results;
  }
  const invalidTokenIds = new Set<string>();

  for (const group of groups) {
    const devices = devicesByUser.get(group.recipientId) ?? [];
    const likeTitle = await resolveLikeTitle(supabase, group);
    const { title, body } = resolveText(group.latest, likeTitle);
    const data = buildDataPayload(group.latest);

    const outcomes: FcmOutcome[] = [];
    for (const device of devices) {
      const message = buildFcmMessage({
        token: device.token,
        title,
        body,
        data,
        category: group.category,
        collapseKey: group.collapseKey,
        badge: badges.get(group.recipientId) ?? null,
      });
      const outcome = await sendToFcm(account, accessToken, message);
      if (outcome.kind === "invalid_token") invalidTokenIds.add(device.id);
      outcomes.push(outcome);
    }

    const summary = summarizeOutcomes(outcomes);
    for (const id of group.rowIds) {
      results.push({ id, status: summary.status, error: summary.error });
    }
  }

  // 4. もう使えない宛先を消す(アプリの削除・トークンの失効)
  if (invalidTokenIds.size > 0) {
    const { error } = await supabase
      .from("push_device_tokens")
      .delete()
      .in("id", [...invalidTokenIds]);
    if (error) {
      console.error("[send-push] removing invalid tokens failed:", error.message);
    } else {
      totals.removedTokens += invalidTokenIds.size;
    }
  }

  return results;
}

/**
 * いいねは「〇〇ほか N 人が…」にまとめる。N はその投稿の未読のいいね数。
 * 端末は collapse_key で前の通知を置き換えるので、今回確保した分ではなく総数で書く。
 */
async function resolveLikeTitle(
  supabase: SupabaseClient,
  group: PushGroup,
): Promise<string | null> {
  const row = group.latest;
  if (row.notification_type !== "like" || !row.notification_entity_id) return null;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", group.recipientId)
    .eq("type", "like")
    .eq("entity_id", row.notification_entity_id)
    .eq("is_read", false);
  if (error || !count || count <= 1) return null;

  let nickname: string | null = null;
  if (row.notification_actor_id) {
    const { data } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("user_id", row.notification_actor_id)
      .maybeSingle();
    nickname = (data as { nickname?: string | null } | null)?.nickname ?? null;
  }
  return buildLikeTitle(nickname, count);
}

async function sendToFcm(
  account: ServiceAccount,
  accessToken: string,
  message: Record<string, unknown>,
): Promise<FcmOutcome> {
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
      },
    );
    const body = await res.json().catch(() => null);
    return classifyFcmResponse(res.status, body);
  } catch (e) {
    // 通信の失敗は一時的なものとしてやり直す
    return { kind: "retry", error: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
}

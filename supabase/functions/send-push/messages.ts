// ===============================================
// send-push: 送る中身の組み立て (pure helper)
// ===============================================
// Edge Function 本体から分離して Jest からテストできるようにする。
// Deno-only import は使わない。
//
// 計画書: docs/planning/push-notifications-implementation-plan.md Phase 2

/** claim_push_outbox が返す 1 行 */
export interface ClaimedRow {
  id: string;
  recipient_id: string;
  category: string;
  collapse_key: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  attempt_count: number;
  notification_id: string | null;
  notification_type: string | null;
  notification_entity_type: string | null;
  notification_entity_id: string | null;
  notification_comment_id: string | null;
  notification_actor_id: string | null;
  notification_data: Record<string, unknown> | null;
}

/** 1 通ぶん。同じ宛先・同じ collapse_key の行は 1 通にまとめる */
export interface PushGroup {
  recipientId: string;
  category: string;
  collapseKey: string | null;
  /** いちばん新しい行(表示文と行き先はこの行のものを使う) */
  latest: ClaimedRow;
  /** まとめた行の id すべて(結果は全部に同じものを記録する) */
  rowIds: string[];
}

/**
 * 送ってよい行を、宛先と collapse_key ごとに 1 通へまとめる。
 * collapse_key の無い行はそれぞれ 1 通。並びは確保した順(send_after の古い順)。
 */
export function groupRows(rows: ClaimedRow[]): PushGroup[] {
  const groups: PushGroup[] = [];
  const byKey = new Map<string, PushGroup>();
  for (const row of rows) {
    if (!row.collapse_key) {
      groups.push({
        recipientId: row.recipient_id,
        category: row.category,
        collapseKey: null,
        latest: row,
        rowIds: [row.id],
      });
      continue;
    }
    const key = `${row.recipient_id}\u0000${row.collapse_key}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.latest = row;
      existing.rowIds.push(row.id);
      continue;
    }
    const group: PushGroup = {
      recipientId: row.recipient_id,
      category: row.category,
      collapseKey: row.collapse_key,
      latest: row,
      rowIds: [row.id],
    };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

const DEFAULT_ACTOR_NAME = "ユーザー";

/**
 * いいねのまとめ文。likeCount はその投稿の未読のいいね数(今回の分を含む)。
 * 端末側は collapse_key で前の通知を置き換えるので、件数は今回確保した分ではなく
 * 未読の総数で書く。1 件なら元の通知と同じ文。
 */
export function buildLikeTitle(
  actorNickname: string | null | undefined,
  likeCount: number,
): string {
  const name = actorNickname?.trim() ? actorNickname.trim() : DEFAULT_ACTOR_NAME;
  const others = Math.max(0, Math.floor(likeCount) - 1);
  if (others === 0) {
    return `${name}があなたの投稿にいいねしました`;
  }
  return `${name}ほか${others}人があなたの投稿にいいねしました`;
}

/** 表示文。タイトルが無い時のための保険も入れる */
export function resolveText(
  row: ClaimedRow,
  likeTitle: string | null,
): { title: string; body: string } {
  const title = likeTitle ?? row.title?.trim() ?? "";
  const body = row.body?.trim() ?? "";
  if (title) {
    return { title, body };
  }
  // タイトルが空の通知は本文を見出しにする(どちらも空なら固定文)
  return { title: body || "Persta.AI からのお知らせ", body: "" };
}

/**
 * アプリが行き先を決めるための data。FCM の data は文字列だけなので、
 * 入れ子(notifications.data)は JSON 文字列にする。空の値は入れない。
 */
export function buildDataPayload(row: ClaimedRow): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  };

  // 生成完了などは outbox 自身の data(kind, image_job_id, status ...)を持つ
  for (const [key, value] of Object.entries(row.data ?? {})) {
    put(key, value);
  }
  put("category", row.category);
  if (row.notification_id) {
    put("kind", out.kind ?? "notification");
    put("notification_id", row.notification_id);
    put("type", row.notification_type);
    put("entity_type", row.notification_entity_type);
    put("entity_id", row.notification_entity_id);
    put("comment_id", row.notification_comment_id);
    put("actor_id", row.notification_actor_id);
    if (row.notification_data && Object.keys(row.notification_data).length > 0) {
      put("data", row.notification_data);
    }
  }
  return out;
}

export interface FcmMessageInput {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  category: string;
  collapseKey: string | null;
  badge: number | null;
}

/** FCM HTTP v1 の message。Android はチャンネル=種類、iOS は未読数のバッジ */
export function buildFcmMessage(input: FcmMessageInput): Record<string, unknown> {
  const notification: Record<string, string> = { title: input.title };
  if (input.body) notification.body = input.body;

  const androidNotification: Record<string, unknown> = {
    channel_id: input.category,
  };
  if (input.collapseKey) {
    // 表示中の同じ通知を置き換える
    androidNotification.tag = input.collapseKey;
  }

  const aps: Record<string, unknown> = {
    sound: "default",
    "thread-id": input.category,
  };
  if (input.badge !== null && input.badge >= 0) {
    aps.badge = input.badge;
  }

  const apnsHeaders: Record<string, string> = { "apns-priority": "10" };
  if (input.collapseKey) {
    // 64 バイトまで。like:<uuid> は 41 バイト
    apnsHeaders["apns-collapse-id"] = input.collapseKey.slice(0, 64);
  }

  const android: Record<string, unknown> = {
    priority: "HIGH",
    notification: androidNotification,
  };
  if (input.collapseKey) {
    android.collapse_key = input.collapseKey;
  }

  return {
    token: input.token,
    notification,
    data: input.data,
    android,
    apns: { headers: apnsHeaders, payload: { aps } },
  };
}

/** FCM の返事 1 件の読み方 */
export type FcmOutcome =
  | { kind: "ok" }
  /** その宛先はもう使えない(アプリ削除・トークン失効)→ 宛先を消す */
  | { kind: "invalid_token"; error: string }
  /** 混雑・一時障害 → 送る時刻を延ばしてやり直す */
  | { kind: "retry"; error: string }
  /** アクセストークンが無効(鍵の差し替え直後など)→ 使い回しを捨ててやり直す */
  | { kind: "unauthorized"; error: string }
  /** それ以外(設定の誤りなど)→ やり直しても直らない */
  | { kind: "failed"; error: string };

interface FcmErrorBody {
  error?: {
    status?: string;
    message?: string;
    details?: Array<{ "@type"?: string; errorCode?: string }>;
  };
}

export function classifyFcmResponse(status: number, body: unknown): FcmOutcome {
  if (status >= 200 && status < 300) {
    return { kind: "ok" };
  }
  const err = (body as FcmErrorBody | null)?.error;
  const fcmCode = err?.details?.find((d) =>
    d["@type"]?.endsWith("google.firebase.fcm.v1.FcmError")
  )?.errorCode;
  const message = `${status} ${fcmCode ?? err?.status ?? ""} ${err?.message ?? ""}`
    .replace(/\s+/g, " ")
    .trim();

  // 宛先を消すのは、宛先そのものが使えないと FCM が言っている時だけ。
  // 詳細コードの無い 404 や SENDER_ID_MISMATCH は、鍵やプロジェクトの設定の誤り
  // (こちら側)でも返るので消さない(消すと、設定を一度間違えるだけで全員の宛先が消える)
  if (fcmCode === "UNREGISTERED") {
    return { kind: "invalid_token", error: message };
  }
  // INVALID_ARGUMENT は送る中身の誤りでも返る。登録トークンが壊れている時だけ宛先を消す
  if (fcmCode === "INVALID_ARGUMENT" && /registration token/i.test(err?.message ?? "")) {
    return { kind: "invalid_token", error: message };
  }
  if (status === 401) {
    return { kind: "unauthorized", error: message };
  }
  if (status === 429 || status >= 500 || fcmCode === "QUOTA_EXCEEDED" ||
    fcmCode === "UNAVAILABLE" || fcmCode === "INTERNAL") {
    return { kind: "retry", error: message };
  }
  return { kind: "failed", error: message };
}

export type GroupStatus = "sent" | "skipped" | "failed" | "retry";

/**
 * 宛先(端末)ごとの結果から、その 1 通の結果を決める。
 * 1 台でも届けば sent。届かず一時障害(アクセストークンの無効を含む)があれば retry。
 * 端末が無ければ skipped。
 */
export function summarizeOutcomes(
  outcomes: FcmOutcome[],
): { status: GroupStatus; error: string | null } {
  if (outcomes.length === 0) {
    return { status: "skipped", error: "no_device" };
  }
  if (outcomes.some((o) => o.kind === "ok")) {
    return { status: "sent", error: null };
  }
  const firstError = (o: FcmOutcome) => ("error" in o ? o.error : "");
  const retry = outcomes.find((o) => o.kind === "retry" || o.kind === "unauthorized");
  if (retry) {
    return { status: "retry", error: firstError(retry) };
  }
  if (outcomes.every((o) => o.kind === "invalid_token")) {
    return { status: "skipped", error: "no_valid_device" };
  }
  const failed = outcomes.find((o) => o.kind === "failed") ?? outcomes[0];
  return { status: "failed", error: firstError(failed) };
}

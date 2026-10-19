import { createAdminClient } from "@/lib/supabase/admin";
import type { AnnouncementPushAction } from "./announcement-push-sync";
import { decoratePushBroadcastAdmin } from "./presentation";
import {
  emptyDeliveryStats,
  type AnnouncementPushSummary,
  type PushBroadcast,
  type PushBroadcastAdminView,
  type PushBroadcastDeliveryStats,
  type PushBroadcastStatus,
} from "./schema";

type SupabaseClient = ReturnType<typeof createAdminClient>;

interface PushBroadcastRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  announcement_id: string | null;
  send_at: string;
  status: PushBroadcastStatus;
  enqueued_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  canceled_at: string | null;
}

interface PushBroadcastStatsRow {
  broadcast_id: string;
  status: string;
  row_count: number | string;
}

/** 一覧に出す件数（新しい順） */
export const PUSH_BROADCAST_LIST_LIMIT = 100;

/** お知らせの ID を何件ずつ in(...) で読むか（URL の長さを抑える） */
export const SUMMARY_ID_CHUNK = 100;

function getSupabase(client?: SupabaseClient) {
  return client ?? createAdminClient();
}

function mapRow(row: PushBroadcastRow): PushBroadcast {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    url: row.url,
    announcementId: row.announcement_id,
    sendAt: row.send_at,
    status: row.status,
    enqueuedCount: row.enqueued_count ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    canceledAt: row.canceled_at,
  };
}

/**
 * push_outbox の状態別件数を配信ごとにまとめる。
 * processing は送信中なので pending（未完了）に数える。
 */
export function aggregateDeliveryStats(
  rows: PushBroadcastStatsRow[]
): Map<string, PushBroadcastDeliveryStats> {
  const result = new Map<string, PushBroadcastDeliveryStats>();
  for (const row of rows) {
    const stats = result.get(row.broadcast_id) ?? emptyDeliveryStats();
    const count = Number(row.row_count) || 0;
    switch (row.status) {
      case "sent":
        stats.sent += count;
        break;
      case "skipped":
        stats.skipped += count;
        break;
      case "failed":
        stats.failed += count;
        break;
      case "pending":
      case "processing":
        stats.pending += count;
        break;
      default:
        break;
    }
    result.set(row.broadcast_id, stats);
  }
  return result;
}

export async function listPushBroadcasts(
  client?: SupabaseClient
): Promise<PushBroadcast[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_push_broadcasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PUSH_BROADCAST_LIST_LIMIT);

  if (error) {
    console.error("[push-broadcasts] list error:", error);
    throw new Error("配信履歴の取得に失敗しました");
  }

  return (data ?? []).map((row) => mapRow(row as PushBroadcastRow));
}

/** 件数。読めなかったら null（0 件と見分けて「確認できません」と出すため） */
export async function getPushBroadcastDeliveryStats(
  broadcastIds: string[],
  client?: SupabaseClient
): Promise<Map<string, PushBroadcastDeliveryStats> | null> {
  if (broadcastIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabase(client);
  const { data, error } = await supabase.rpc("admin_push_broadcast_stats", {
    p_broadcast_ids: broadcastIds,
  });

  if (error) {
    // 件数は補助情報。取れなくても一覧は出す（null で「確認できません」と出す）
    console.error("[push-broadcasts] stats error:", error);
    return null;
  }

  return aggregateDeliveryStats((data ?? []) as PushBroadcastStatsRow[]);
}

export async function createPushBroadcast(
  input: {
    title: string;
    body: string;
    url: string | null;
    sendAt: string;
    createdBy: string | null;
  },
  client?: SupabaseClient
): Promise<PushBroadcast> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_push_broadcasts")
    .insert({
      title: input.title,
      body: input.body,
      url: input.url,
      send_at: input.sendAt,
      status: "scheduled",
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[push-broadcasts] create error:", error);
    throw new Error("配信の作成に失敗しました");
  }

  return mapRow(data as PushBroadcastRow);
}

export async function getPushBroadcastById(
  id: string,
  client?: SupabaseClient
): Promise<PushBroadcast | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_push_broadcasts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[push-broadcasts] get error:", error);
    throw new Error("配信の取得に失敗しました");
  }

  return data ? mapRow(data as PushBroadcastRow) : null;
}

/** お知らせに紐づく配信（1 お知らせに 1 行）。無ければ null */
export async function getPushBroadcastForAnnouncement(
  announcementId: string,
  client?: SupabaseClient
): Promise<PushBroadcast | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_push_broadcasts")
    .select("*")
    .eq("announcement_id", announcementId)
    .maybeSingle();

  if (error) {
    console.error("[push-broadcasts] get for announcement error:", error);
    throw new Error("プッシュ通知の状態の取得に失敗しました");
  }

  return data ? mapRow(data as PushBroadcastRow) : null;
}

/**
 * 予約中（scheduled）のときだけ取り消す。展開が始まっていたら null。
 * 展開中の行は fan_out_push_broadcasts が FOR UPDATE で握っているので、
 * 条件付き UPDATE で競合しても二重に動かない。
 */
export async function cancelScheduledPushBroadcast(
  id: string,
  client?: SupabaseClient
): Promise<PushBroadcast | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_push_broadcasts")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[push-broadcasts] cancel error:", error);
    throw new Error("配信の取り消しに失敗しました");
  }

  return data ? mapRow(data as PushBroadcastRow) : null;
}

function toAnnouncementPushSummary(
  row: PushBroadcastRow,
  stats: Map<string, PushBroadcastDeliveryStats> | null
): AnnouncementPushSummary {
  return {
    id: row.id,
    status: row.status,
    sendAt: row.send_at,
    enqueuedCount: row.enqueued_count ?? 0,
    pendingCount: stats === null ? null : (stats.get(row.id)?.pending ?? 0),
  };
}

export async function getAnnouncementPushSummaries(
  announcementIds: string[],
  client?: SupabaseClient
): Promise<Map<string, AnnouncementPushSummary>> {
  if (announcementIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabase(client);
  // in(...) は URL に入るので、お知らせが多いと長すぎて失敗する。少しずつ読む
  const rows: PushBroadcastRow[] = [];
  for (let i = 0; i < announcementIds.length; i += SUMMARY_ID_CHUNK) {
    const { data, error } = await supabase
      .from("admin_push_broadcasts")
      .select("*")
      .in("announcement_id", announcementIds.slice(i, i + SUMMARY_ID_CHUNK));

    if (error) {
      console.error("[push-broadcasts] announcement summaries error:", error);
      throw new Error("プッシュ通知の状態の取得に失敗しました");
    }
    rows.push(
      ...((data ?? []) as PushBroadcastRow[]).filter((row) => row.announcement_id)
    );
  }
  // 送り終えていない数（「送信中／送信済み」の表示用）。積み始めたものだけ数える
  const stats = await getPushBroadcastDeliveryStats(
    rows
      .filter((row) => row.status !== "scheduled" && row.status !== "canceled")
      .map((row) => row.id),
    supabase
  );

  const result = new Map<string, AnnouncementPushSummary>();
  for (const row of rows) {
    result.set(
      row.announcement_id as string,
      toAnnouncementPushSummary(row, stats)
    );
  }
  return result;
}

/**
 * decideAnnouncementPushAction の結果を書き込む。
 * 送る前（scheduled / canceled）の行だけを書き換えるよう status で絞る
 * （その間に展開が始まっていたら何も変えない）。
 *
 * 戻り値は書き換えられたか。予約の変更・取り消しで、その間に送信が始まっていた
 * （0 行だった）ときは false。呼び出し側はそれを運営に知らせる。
 */
export async function applyAnnouncementPushAction(
  announcementId: string,
  action: AnnouncementPushAction,
  createdBy: string | null,
  client?: SupabaseClient
): Promise<boolean> {
  if (action.type === "none" || action.type === "locked") {
    return true;
  }

  const supabase = getSupabase(client);

  if (action.type === "create") {
    const { error } = await supabase.from("admin_push_broadcasts").insert({
      announcement_id: announcementId,
      title: action.content.title,
      body: action.content.body,
      url: null,
      send_at: action.content.sendAt,
      status: "scheduled",
      created_by: createdBy,
    });

    if (error) {
      console.error("[push-broadcasts] create for announcement error:", error);
      throw new Error("プッシュ通知の予約に失敗しました");
    }
    return true;
  }

  if (action.type === "reschedule") {
    const { data, error } = await supabase
      .from("admin_push_broadcasts")
      .update({
        title: action.content.title,
        body: action.content.body,
        send_at: action.content.sendAt,
        status: "scheduled",
        canceled_at: null,
      })
      .eq("id", action.id)
      .in("status", ["scheduled", "canceled"])
      .select("id");

    if (error) {
      console.error("[push-broadcasts] reschedule error:", error);
      throw new Error("プッシュ通知の予約の更新に失敗しました");
    }
    return (data ?? []).length > 0;
  }

  return (await cancelScheduledPushBroadcast(action.id, supabase)) !== null;
}

/** 管理画面の一覧（状態別件数と表示用の値つき） */
export async function listPushBroadcastsForAdmin(
  client?: SupabaseClient
): Promise<PushBroadcastAdminView[]> {
  const supabase = getSupabase(client);
  const broadcasts = await listPushBroadcasts(supabase);
  const stats = await getPushBroadcastDeliveryStats(
    broadcasts.map((broadcast) => broadcast.id),
    supabase
  );
  return broadcasts.map((broadcast) =>
    decoratePushBroadcastAdmin(
      broadcast,
      stats === null ? null : stats.get(broadcast.id)
    )
  );
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import type {
  TimelineEventInput,
  TimelineEventKind,
} from "./admin-list-validation";

/**
 * 出来事の印(admin_timeline_events)の読み書き。
 * 企画・広告・値段の改定・リリースなど「何かを変えた日」を残し、
 * 日ごとのグラフに縦線で出す。表は service_role だけが触れる。
 * updated_at は DB のトリガーが入れる。
 */

export interface TimelineEvent {
  id: string;
  eventDate: string;
  kind: TimelineEventKind;
  title: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TimelineEventRow {
  id: string;
  event_date: string;
  kind: TimelineEventKind;
  title: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, event_date, kind, title, note, created_by, created_at, updated_at";

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function toTimelineEvent(row: TimelineEventRow): TimelineEvent {
  return {
    id: row.id,
    eventDate: row.event_date,
    kind: row.kind,
    title: row.title,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 一覧。from / to(YYYY-MM-DD・両端を含む)で絞れる。日付の新しい順。
 * 1,000行の打ち切りで黙って欠けないよう、id のカーソルで全件たどってから並べる。
 */
export async function listTimelineEvents(
  range: { from?: string; to?: string } = {},
  client?: SupabaseClient,
): Promise<TimelineEvent[]> {
  const supabase = getSupabase(client);
  const { data, error } = await fetchAllRows<TimelineEventRow>((cursor, size) => {
    let query = supabase.from("admin_timeline_events").select(COLUMNS);
    if (range.from) query = query.gte("event_date", range.from);
    if (range.to) query = query.lte("event_date", range.to);
    if (cursor) query = query.gt("id", cursor);
    return query.order("id", { ascending: true }).limit(size);
  });
  if (error) {
    throw new Error(`出来事の印の取得に失敗しました: ${error.message}`);
  }
  return (data ?? [])
    .map(toTimelineEvent)
    .sort(
      (a, b) =>
        b.eventDate.localeCompare(a.eventDate) || b.createdAt.localeCompare(a.createdAt),
    );
}

export async function createTimelineEvent(
  params: TimelineEventInput & { createdBy: string },
  client?: SupabaseClient,
): Promise<TimelineEvent> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_timeline_events")
    .insert({
      event_date: params.eventDate,
      kind: params.kind,
      title: params.title,
      note: params.note,
      created_by: params.createdBy,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    console.error("[timeline-events] create error:", error);
    throw new Error("出来事の印の追加に失敗しました");
  }
  return toTimelineEvent(data as TimelineEventRow);
}

/** 直す。見つからなければ null。 */
export async function updateTimelineEvent(
  id: string,
  patch: Partial<TimelineEventInput>,
  client?: SupabaseClient,
): Promise<TimelineEvent | null> {
  const supabase = getSupabase(client);
  const update: Record<string, unknown> = {};
  if (patch.eventDate !== undefined) update.event_date = patch.eventDate;
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.note !== undefined) update.note = patch.note;

  const { data, error } = await supabase
    .from("admin_timeline_events")
    .update(update)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[timeline-events] update error:", error);
    throw new Error("出来事の印の更新に失敗しました");
  }
  return data ? toTimelineEvent(data as TimelineEventRow) : null;
}

/** 消す。消した行があれば true。 */
export async function deleteTimelineEvent(
  id: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_timeline_events")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("[timeline-events] delete error:", error);
    throw new Error("出来事の印の削除に失敗しました");
  }
  return (data ?? []).length > 0;
}

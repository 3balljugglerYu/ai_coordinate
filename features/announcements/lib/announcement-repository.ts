import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AnnouncementAdmin,
  AnnouncementDetail,
  AnnouncementStatus,
  AnnouncementSummary,
  AnnouncementUnreadState,
} from "./schema";

type SupabaseClient = ReturnType<typeof createAdminClient>;

interface AdminAnnouncementRow {
  id: string;
  title: string;
  body_json: unknown;
  body_text: string;
  asset_paths: string[];
  status: AnnouncementStatus;
  publish_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface AnnouncementReadRow {
  announcement_id: string;
  user_id: string;
  read_at: string | null;
  created_at: string;
}

function getSupabase(client?: SupabaseClient) {
  return client ?? createAdminClient();
}

function mapRowToAdmin(row: AdminAnnouncementRow): AnnouncementAdmin {
  return {
    id: row.id,
    title: row.title,
    bodyJson: row.body_json,
    bodyText: row.body_text,
    assetPaths: row.asset_paths ?? [],
    status: row.status,
    publishAt: row.publish_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToSummary(
  row: AdminAnnouncementRow,
  readAt: string | null
): AnnouncementSummary {
  return {
    id: row.id,
    title: row.title,
    publishAt: row.publish_at ?? row.created_at,
    isRead: Boolean(readAt),
    readAt,
  };
}

function mapRowToDetail(
  row: AdminAnnouncementRow,
  readAt: string | null
): AnnouncementDetail {
  return {
    ...mapRowToSummary(row, readAt),
    bodyJson: row.body_json,
    bodyText: row.body_text,
  };
}

function isPublishedAfter(seenAt: string | null, latestPublishedAt: string | null) {
  if (!latestPublishedAt) {
    return false;
  }

  if (!seenAt) {
    return true;
  }

  return new Date(latestPublishedAt).getTime() > new Date(seenAt).getTime();
}

export async function listAnnouncementsForAdmin(
  client?: SupabaseClient
): Promise<AnnouncementAdmin[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_announcements")
    .select("*")
    .order("publish_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[announcements] list admin error:", error);
    throw new Error("お知らせ一覧の取得に失敗しました");
  }

  return (data ?? []).map((row) => mapRowToAdmin(row as AdminAnnouncementRow));
}

export async function getAnnouncementForAdminById(
  id: string,
  client?: SupabaseClient
): Promise<AnnouncementAdmin | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[announcements] get admin by id error:", error);
    throw new Error("お知らせの取得に失敗しました");
  }

  return data ? mapRowToAdmin(data as AdminAnnouncementRow) : null;
}

export async function createAnnouncement(
  input: {
    id?: string;
    title: string;
    bodyJson: unknown;
    bodyText: string;
    assetPaths: string[];
    status: AnnouncementStatus;
    publishAt: string | null;
    createdBy: string | null;
  },
  client?: SupabaseClient
): Promise<AnnouncementAdmin> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_announcements")
    .insert({
      id: input.id ?? crypto.randomUUID(),
      title: input.title.trim(),
      body_json: input.bodyJson,
      body_text: input.bodyText,
      asset_paths: input.assetPaths,
      status: input.status,
      publish_at: input.publishAt,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[announcements] create error:", error);
    throw new Error("お知らせの作成に失敗しました");
  }

  return mapRowToAdmin(data as AdminAnnouncementRow);
}

export async function updateAnnouncement(
  id: string,
  input: {
    title: string;
    bodyJson: unknown;
    bodyText: string;
    assetPaths: string[];
    status: AnnouncementStatus;
    publishAt: string | null;
    updatedBy: string | null;
  },
  client?: SupabaseClient
): Promise<AnnouncementAdmin> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("admin_announcements")
    .update({
      title: input.title.trim(),
      body_json: input.bodyJson,
      body_text: input.bodyText,
      asset_paths: input.assetPaths,
      status: input.status,
      publish_at: input.publishAt,
      updated_by: input.updatedBy,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[announcements] update error:", error);
    throw new Error("お知らせの更新に失敗しました");
  }

  return mapRowToAdmin(data as AdminAnnouncementRow);
}

export async function deleteAnnouncement(
  id: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);
  const { error } = await supabase
    .from("admin_announcements")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[announcements] delete error:", error);
    throw new Error("お知らせの削除に失敗しました");
  }
}

export async function listPublishedAnnouncementsForUser(
  userId: string,
  client?: SupabaseClient
): Promise<AnnouncementSummary[]> {
  const supabase = getSupabase(client);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("admin_announcements")
    .select("*")
    .eq("status", "published")
    .lte("publish_at", nowIso)
    .order("publish_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[announcements] list published error:", error);
    throw new Error("お知らせ一覧の取得に失敗しました");
  }

  const rows = (data ?? []) as AdminAnnouncementRow[];
  if (rows.length === 0) {
    return [];
  }

  const announcementIds = rows.map((row) => row.id);
  const { data: reads, error: readsError } = await supabase
    .from("announcement_reads")
    .select("announcement_id, read_at")
    .eq("user_id", userId)
    .in("announcement_id", announcementIds);

  if (readsError) {
    console.error("[announcements] list reads error:", readsError);
    throw new Error("お知らせ既読状態の取得に失敗しました");
  }

  const readMap = new Map(
    ((reads ?? []) as AnnouncementReadRow[]).map((row) => [
      row.announcement_id,
      row.read_at,
    ])
  );

  return rows.map((row) => mapRowToSummary(row, readMap.get(row.id) ?? null));
}

export async function getPublishedAnnouncementDetailForUser(
  id: string,
  userId: string,
  client?: SupabaseClient
): Promise<AnnouncementDetail | null> {
  const supabase = getSupabase(client);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("admin_announcements")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .lte("publish_at", nowIso)
    .maybeSingle();

  if (error) {
    console.error("[announcements] get published detail error:", error);
    throw new Error("お知らせ詳細の取得に失敗しました");
  }

  if (!data) {
    return null;
  }

  const { data: readRow, error: readError } = await supabase
    .from("announcement_reads")
    .select("read_at")
    .eq("announcement_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[announcements] get detail read error:", readError);
    throw new Error("お知らせ既読状態の取得に失敗しました");
  }

  return mapRowToDetail(
    data as AdminAnnouncementRow,
    typeof readRow?.read_at === "string" ? readRow.read_at : null
  );
}

export async function markAnnouncementReadForUser(
  announcementId: string,
  userId: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("announcement_reads").upsert(
    {
      announcement_id: announcementId,
      user_id: userId,
      read_at: nowIso,
      created_at: nowIso,
    },
    {
      onConflict: "announcement_id,user_id",
    }
  );

  if (error) {
    console.error("[announcements] mark read error:", error);
    throw new Error("お知らせの既読化に失敗しました");
  }
}

export async function setAnnouncementSeenSurfaceForUser(
  userId: string,
  surface: "page" | "tab",
  client?: SupabaseClient
): Promise<string> {
  const supabase = getSupabase(client);
  const nowIso = new Date().toISOString();
  const column =
    surface === "page"
      ? "notifications_page_seen_at"
      : "announcements_tab_seen_at";

  const { data, error } = await supabase
    .from("profiles")
    .update({
      [column]: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    console.error("[announcements] set seen update error:", error);
    throw new Error("既読状態の更新に失敗しました");
  }

  if (!data?.length) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      user_id: userId,
      [column]: nowIso,
      updated_at: nowIso,
    });

    if (insertError) {
      console.error("[announcements] set seen insert error:", insertError);
      throw new Error("既読状態の更新に失敗しました");
    }
  }

  return nowIso;
}

export async function getAnnouncementUnreadStateForUser(
  userId: string,
  client?: SupabaseClient
): Promise<AnnouncementUnreadState> {
  const supabase = getSupabase(client);
  const nowIso = new Date().toISOString();

  const [{ data: profile, error: profileError }, { data: latestRow, error: latestError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("notifications_page_seen_at, announcements_tab_seen_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("admin_announcements")
        .select("publish_at")
        .eq("status", "published")
        .lte("publish_at", nowIso)
        .order("publish_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (profileError) {
    console.error("[announcements] unread state profile error:", profileError);
    throw new Error("お知らせ未読状態の取得に失敗しました");
  }

  if (latestError) {
    console.error("[announcements] unread state latest error:", latestError);
    throw new Error("お知らせ未読状態の取得に失敗しました");
  }

  const latestPublishedAt =
    typeof latestRow?.publish_at === "string" ? latestRow.publish_at : null;

  return {
    hasPageDot: isPublishedAfter(
      typeof profile?.notifications_page_seen_at === "string"
        ? profile.notifications_page_seen_at
        : null,
      latestPublishedAt
    ),
    hasTabDot: isPublishedAfter(
      typeof profile?.announcements_tab_seen_at === "string"
        ? profile.announcements_tab_seen_at
        : null,
      latestPublishedAt
    ),
    latestPublishedAt,
  };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import { parseRecipientLine } from "./parse-recipient-line";

/** 宛先の1行が送れない理由(画面の文言は lookup-messages.ts) */
export type RecipientLookupError =
  | "invalid_input"
  | "post_not_found"
  | "post_not_visible"
  | "user_not_found"
  | "user_unavailable"
  | "duplicate";

export interface RecipientLookupRow {
  line: number;
  input: string;
  kind: "post" | "user" | "invalid";
  recipientId: string | null;
  postId: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  postThumbUrl: string | null;
  error: RecipientLookupError | null;
  /** error が duplicate のとき、最初に出てきた行 */
  duplicateOfLine: number | null;
}

type PostRow = {
  id: string;
  user_id: string;
  is_posted: boolean | null;
  moderation_status: string | null;
  image_url: string | null;
  storage_path: string | null;
  storage_path_thumb: string | null;
};

type ProfileRow = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  deactivated_at: string | null;
};

/**
 * 貼った宛先を1行ずつ確かめる。投稿の行は投稿した人を宛先にし、作品が
 * 公開中か(送るときの DB の条件と同じ)を見る。最初の1行で止めず、全部の行の結果を返す。
 */
export async function lookupPersonalNoticeRecipients(
  lines: Array<{ line: number; input: string }>
): Promise<RecipientLookupRow[]> {
  const parsed = lines.map((row) => ({ ...row, parsed: parseRecipientLine(row.input) }));
  const supabase = createAdminClient();

  const postIds = [
    ...new Set(
      parsed.flatMap((row) => (row.parsed.kind === "post" ? [row.parsed.postId] : []))
    ),
  ];
  const posts = new Map<string, PostRow>();
  if (postIds.length > 0) {
    const { data, error } = await supabase
      .from("generated_images")
      .select(
        "id, user_id, is_posted, moderation_status, image_url, storage_path, storage_path_thumb"
      )
      .in("id", postIds);
    if (error) throw error;
    for (const post of (data ?? []) as PostRow[]) posts.set(post.id, post);
  }

  const userIds = [
    ...new Set(
      parsed.flatMap((row) => {
        if (row.parsed.kind === "user") return [row.parsed.userId];
        if (row.parsed.kind === "post") {
          const owner = posts.get(row.parsed.postId)?.user_id;
          return owner ? [owner] : [];
        }
        return [];
      })
    ),
  ];
  const profiles = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, deactivated_at")
      .in("user_id", userIds);
    if (error) throw error;
    for (const profile of (data ?? []) as ProfileRow[]) {
      profiles.set(profile.user_id, profile);
    }
  }

  const firstLineByRecipient = new Map<string, number>();

  return parsed.map(({ line, input, parsed: target }) => {
    const row: RecipientLookupRow = {
      line,
      input,
      kind: target.kind,
      recipientId: null,
      postId: null,
      nickname: null,
      avatarUrl: null,
      postThumbUrl: null,
      error: null,
      duplicateOfLine: null,
    };

    if (target.kind === "invalid") {
      return { ...row, error: "invalid_input" };
    }

    if (target.kind === "post") {
      const post = posts.get(target.postId);
      if (!post) {
        return { ...row, postId: target.postId, error: "post_not_found" };
      }
      row.postId = post.id;
      row.recipientId = post.user_id;
      row.postThumbUrl = getPostThumbUrl(post) || null;
      if (post.is_posted !== true || post.moderation_status !== "visible") {
        row.error = "post_not_visible";
      }
    } else {
      row.recipientId = target.userId;
    }

    const profile = row.recipientId ? profiles.get(row.recipientId) : undefined;
    if (!profile) {
      return { ...row, error: row.error ?? "user_not_found" };
    }
    row.nickname = profile.nickname;
    row.avatarUrl = profile.avatar_url;
    if (profile.deactivated_at) {
      row.error = row.error ?? "user_unavailable";
    }

    const firstLine = firstLineByRecipient.get(profile.user_id);
    if (firstLine !== undefined) {
      return { ...row, error: row.error ?? "duplicate", duplicateOfLine: firstLine };
    }
    firstLineByRecipient.set(profile.user_id, line);
    return row;
  });
}

export type SendPersonalNoticeResult =
  | { ok: true; noticeId: string; recipientCount: number }
  | { ok: false; code: string; rowIndex: number | null };

/**
 * 全員分を1回の DB 関数で送る(1件でも不備があれば何も送らない)。
 * p_admin_user_id は呼び出し側がセッションから入れる。
 */
export async function sendPersonalNotice(input: {
  adminUserId: string;
  memo: string;
  title: string;
  body: string;
  codePrefix: string | null;
  recipients: Array<{ recipientId: string; postId: string | null }>;
}): Promise<SendPersonalNoticeResult> {
  const { data, error } = await createAdminClient().rpc("send_personal_notice", {
    p_admin_user_id: input.adminUserId,
    p_memo: input.memo,
    p_title: input.title,
    p_body_template: input.body,
    p_code_prefix: input.codePrefix,
    p_recipients: input.recipients.map((r) => ({
      recipient_id: r.recipientId,
      post_id: r.postId,
    })),
  });

  if (error) {
    const code = /^PN_[A-Z_]+$/.test(error.message) ? error.message : "UNKNOWN";
    if (code === "UNKNOWN") {
      console.error("[PersonalNotices] send_personal_notice error:", error);
    }
    const rowIndex =
      typeof error.details === "string" && /^\d+$/.test(error.details)
        ? Number(error.details)
        : null;
    return { ok: false, code, rowIndex };
  }

  const result = data as { notice_id: string; recipients: unknown[] };
  return {
    ok: true,
    noticeId: result.notice_id,
    recipientCount: result.recipients.length,
  };
}

export type RetractResult =
  | { ok: true; retracted: boolean }
  | { ok: false; code: string };

export async function retractPersonalNoticeRecipient(input: {
  adminUserId: string;
  recipientRowId: string;
}): Promise<RetractResult> {
  const { data, error } = await createAdminClient().rpc(
    "retract_personal_notice_recipient",
    {
      p_admin_user_id: input.adminUserId,
      p_recipient_row_id: input.recipientRowId,
    }
  );
  if (error) {
    const code = /^PN_[A-Z_]+$/.test(error.message) ? error.message : "UNKNOWN";
    if (code === "UNKNOWN") {
      console.error("[PersonalNotices] retract error:", error);
    }
    return { ok: false, code };
  }
  return { ok: true, retracted: (data as { retracted: boolean }).retracted };
}

export interface PersonalNoticeSummary {
  id: string;
  memo: string;
  title: string;
  recipientCount: number;
  openedCount: number;
  retractedCount: number;
  createdAt: string;
}

const LIST_LIMIT = 100;
const PAGE_SIZE = 1000;

/** 送った記録の一覧(新しい順・メモで絞り込み)。開いた人数・取り消しの人数つき */
export async function listPersonalNotices(
  query?: string
): Promise<PersonalNoticeSummary[]> {
  const supabase = createAdminClient();
  let request = supabase
    .from("personal_notices")
    .select("id, memo, title, recipient_count, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  const keyword = query?.trim();
  if (keyword) {
    // ilike の印(% _ \)は文字として探す
    request = request.ilike("memo", `%${keyword.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const { data: notices, error } = await request;
  if (error) throw error;
  if (!notices || notices.length === 0) return [];

  // 1回の取得は PostgREST の上限(1000行)で黙って切れるので、ページを送って全部読む
  const counts = new Map<string, { opened: number; retracted: number }>();
  const ids = notices.map((n) => n.id);
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: rows, error: rowsError } = await supabase
      .from("personal_notice_recipients")
      .select("id, notice_id, opened_at, retracted_at")
      .in("notice_id", ids)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (rowsError) throw rowsError;
    for (const row of rows ?? []) {
      const count = counts.get(row.notice_id) ?? { opened: 0, retracted: 0 };
      if (row.retracted_at) count.retracted += 1;
      else if (row.opened_at) count.opened += 1;
      counts.set(row.notice_id, count);
    }
    if (!rows || rows.length < PAGE_SIZE) break;
  }

  return notices.map((notice) => ({
    id: notice.id,
    memo: notice.memo,
    title: notice.title,
    recipientCount: notice.recipient_count,
    openedCount: counts.get(notice.id)?.opened ?? 0,
    retractedCount: counts.get(notice.id)?.retracted ?? 0,
    createdAt: notice.created_at,
  }));
}

export interface PersonalNoticeRecipientView {
  id: string;
  recipientId: string;
  nickname: string | null;
  avatarUrl: string | null;
  receiptCode: string | null;
  postId: string | null;
  postThumbUrl: string | null;
  openedAt: string | null;
  retractedAt: string | null;
}

export interface PersonalNoticeDetail {
  id: string;
  memo: string;
  title: string;
  bodyTemplate: string;
  codePrefix: string | null;
  recipientCount: number;
  createdAt: string;
  recipients: PersonalNoticeRecipientView[];
}

/** 送った1回分の中身(相手は最大200人なので1回で読める) */
export async function getPersonalNoticeDetail(
  id: string
): Promise<PersonalNoticeDetail | null> {
  const supabase = createAdminClient();
  const { data: notice, error } = await supabase
    .from("personal_notices")
    .select("id, memo, title, body_template, code_prefix, recipient_count, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!notice) return null;

  const { data: rows, error: rowsError } = await supabase
    .from("personal_notice_recipients")
    .select("id, recipient_id, receipt_code, post_id, opened_at, retracted_at, created_at")
    .eq("notice_id", id)
    .order("created_at")
    .order("id");
  if (rowsError) throw rowsError;
  const recipients = rows ?? [];

  const userIds = [...new Set(recipients.map((r) => r.recipient_id))];
  const postIds = [
    ...new Set(recipients.flatMap((r) => (r.post_id ? [r.post_id] : []))),
  ];
  const [profilesResult, postsResult] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from("profiles")
          .select("user_id, nickname, avatar_url")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length > 0
      ? supabase
          .from("generated_images")
          .select("id, image_url, storage_path, storage_path_thumb")
          .in("id", postIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (postsResult.error) throw postsResult.error;

  const profiles = new Map(
    (profilesResult.data ?? []).map((p) => [p.user_id as string, p])
  );
  const posts = new Map(
    (postsResult.data ?? []).map((p) => [p.id as string, p])
  );

  return {
    id: notice.id,
    memo: notice.memo,
    title: notice.title,
    bodyTemplate: notice.body_template,
    codePrefix: notice.code_prefix,
    recipientCount: notice.recipient_count,
    createdAt: notice.created_at,
    recipients: recipients.map((r) => {
      const profile = profiles.get(r.recipient_id);
      const post = r.post_id ? posts.get(r.post_id) : undefined;
      return {
        id: r.id,
        recipientId: r.recipient_id,
        nickname: profile?.nickname ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        receiptCode: r.receipt_code,
        postId: r.post_id,
        postThumbUrl: post ? getPostThumbUrl(post) || null : null,
        openedAt: r.opened_at,
        retractedAt: r.retracted_at,
      };
    }),
  };
}

/**
 * 判定詳細・異議申立てのデータアクセス。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-008, ADR-011 / REQ-006, REQ-012, REQ-022, REQ-023
 *
 * ## 通報者の匿名性について（最重要）
 *
 * `moderation_audit_logs` は `action = 'pending_auto'` の行に **通報したユーザー本人の
 * user_id** を `actor_id` として持ち、`metadata` に通報件数と加重スコアを持つ。
 * 投稿者向けの経路でこれらを射影すると通報者が特定されうる。
 *
 * このため本モジュールの投稿者向け関数は：
 *   - `select("*")` を使わない
 *   - 下記 `AUTHOR_FACING_DECISION_COLUMNS` の列だけを射影する
 *   - `action = 'reject'` の行のみを対象にする（`pending_auto` は一切返さない）
 *
 * 列を足すときは「投稿者に見せてよいか」を必ず確認すること。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 投稿者に開示してよい列のみの allowlist。
 *
 * 意図的に含めていない列:
 *   - actor_id     : pending_auto では通報者本人。reject でも運営の個人情報
 *   - metadata     : weightedScore / recentCount / activeUsers（通報件数の推測材料）
 *   - internal_note: 運営内部メモ
 */
export const AUTHOR_FACING_DECISION_COLUMNS = [
  "id",
  "post_id",
  "action",
  "policy_code",
  "policy_version",
  "policy_anchor",
  "author_facing_reason",
  "restriction_scope",
  "restriction_duration",
  "decision_source",
  "automated_means_used",
  "created_at",
].join(",");

/** 申立期限（利用規約: 措置の通知から原則14日以内）。 */
export const APPEAL_WINDOW_DAYS = 14;

export interface AuthorFacingDecision {
  id: string;
  post_id: string;
  action: string;
  policy_code: string | null;
  policy_version: string | null;
  policy_anchor: string | null;
  author_facing_reason: string | null;
  restriction_scope: string | null;
  restriction_duration: string | null;
  decision_source: string | null;
  automated_means_used: boolean | null;
  created_at: string;
}

export interface AppealRecord {
  id: string;
  post_id: string;
  removal_decision_id: string;
  status: "pending" | "upheld" | "overturned";
  body: string;
  decision_note: string | null;
  decided_at: string | null;
  appeal_deadline_at: string | null;
  created_at: string;
}

export interface DecisionDetailForOwner {
  decision: AuthorFacingDecision;
  appeal: AppealRecord | null;
  /** 通知の配送完了時刻。未配送なら null。 */
  notifiedAt: string | null;
  /** 申立期限。未配送のうちは null（= 期限切れにしない）。 */
  appealDeadlineAt: string | null;
  /** 現時点で新規に申し立てられるか。 */
  canAppeal: boolean;
  /** 投稿の現在の状態。復帰済みでも詳細は閲覧できる。 */
  postModerationStatus: "visible" | "pending" | "removed" | null;
}

/**
 * DB 行を投稿者向けの形へ明示的に射影する。
 *
 * `select()` の allowlist だけに頼らず、**出口でも列を絞る**。
 * 将来クエリが `select("*")` に変わったり、別の取得経路が足されたときに、
 * `actor_id` / `metadata` / `internal_note` が投稿者へ素通りするのを防ぐ二重の防御。
 * ここにフィールドを足すときは「投稿者に見せてよいか」を必ず確認すること。
 */
function toAuthorFacingDecision(row: AuthorFacingDecision): AuthorFacingDecision {
  return {
    id: row.id,
    post_id: row.post_id,
    action: row.action,
    policy_code: row.policy_code ?? null,
    policy_version: row.policy_version ?? null,
    policy_anchor: row.policy_anchor ?? null,
    author_facing_reason: row.author_facing_reason ?? null,
    restriction_scope: row.restriction_scope ?? null,
    restriction_duration: row.restriction_duration ?? null,
    decision_source: row.decision_source ?? null,
    automated_means_used: row.automated_means_used ?? null,
    created_at: row.created_at,
  };
}

/** 異議申立て行も同様に、投稿者へ返してよい列だけに絞る。 */
function toAuthorFacingAppeal(row: AppealRecord): AppealRecord {
  return {
    id: row.id,
    post_id: row.post_id,
    removal_decision_id: row.removal_decision_id,
    status: row.status,
    body: row.body,
    decision_note: row.decision_note ?? null,
    decided_at: row.decided_at ?? null,
    appeal_deadline_at: row.appeal_deadline_at ?? null,
    created_at: row.created_at,
  };
}

function computeDeadline(notifiedAt: string | null): string | null {
  if (!notifiedAt) return null;
  const base = new Date(notifiedAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 投稿者向けの判定詳細を取得する。
 *
 * 所有者の照合はサーバー側セッションの user id で行い、他人の判定は返さない。
 * 投稿が visible に復帰した後でも取得できる（ADR-008）。
 */
export async function getModerationDecisionForOwner(
  decisionId: string,
  userId: string,
  clients?: {
    sessionClient?: SupabaseClient;
    adminClient?: ReturnType<typeof createAdminClient>;
  }
): Promise<DecisionDetailForOwner | null> {
  const adminClient = clients?.adminClient ?? createAdminClient();

  // 列 allowlist で取得し、reject 行のみを対象にする（REQ-022）
  const { data: decision, error: decisionError } = await adminClient
    .from("moderation_audit_logs")
    .select(AUTHOR_FACING_DECISION_COLUMNS)
    .eq("id", decisionId)
    .eq("action", "reject")
    .maybeSingle<AuthorFacingDecision>();

  if (decisionError) {
    console.error("[Moderation] decision fetch failed:", { decisionId, decisionError });
    return null;
  }
  if (!decision) {
    return null;
  }

  // 所有者照合。投稿の現在状態も同時に取る。
  const { data: post, error: postError } = await adminClient
    .from("generated_images")
    .select("user_id,moderation_status")
    .eq("id", decision.post_id)
    .maybeSingle<{ user_id: string | null; moderation_status: string | null }>();

  if (postError) {
    console.error("[Moderation] post fetch failed:", { decisionId, postError });
    return null;
  }
  if (!post || post.user_id !== userId) {
    // 他人の判定は「存在しない」として扱う（REQ-014）
    return null;
  }

  // 通知の配送完了時刻から申立期限を算出する。未配送なら期限なし。
  const { data: outbox } = await adminClient
    .from("moderation_notification_outbox")
    .select("delivered_at")
    .eq("moderation_decision_id", decisionId)
    .eq("notification_type", "post_moderation_removed")
    .maybeSingle<{ delivered_at: string | null }>();

  const notifiedAt = outbox?.delivered_at ?? null;
  const deadline = computeDeadline(notifiedAt);

  const { data: appeal } = await adminClient
    .from("post_moderation_appeals")
    .select(
      "id,post_id,removal_decision_id,status,body,decision_note,decided_at,appeal_deadline_at,created_at"
    )
    .eq("removal_decision_id", decisionId)
    .eq("appellant_id", userId)
    .maybeSingle<AppealRecord>();

  const withinDeadline = deadline === null || Date.now() <= new Date(deadline).getTime();

  return {
    // 出口でも列を絞る（allowlist と二重の防御。ADR-011 / REQ-022）
    decision: toAuthorFacingDecision(decision),
    appeal: appeal ? toAuthorFacingAppeal(appeal) : null,
    notifiedAt,
    appealDeadlineAt: deadline,
    canAppeal:
      !appeal && post.moderation_status === "removed" && withinDeadline,
    postModerationStatus:
      (post.moderation_status as DecisionDetailForOwner["postModerationStatus"]) ?? null,
  };
}

/**
 * 生成ギャラリーの tombstone から遷移させるための、現在有効な公開停止判定 ID。
 * 同じ投稿が複数回公開停止されている場合は最新の reject 行を返す。
 */
export async function getCurrentRemovalDecisionId(
  postId: string,
  userId: string,
  adminClientOverride?: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const adminClient = adminClientOverride ?? createAdminClient();

  const { data: post } = await adminClient
    .from("generated_images")
    .select("user_id,moderation_status")
    .eq("id", postId)
    .maybeSingle<{ user_id: string | null; moderation_status: string | null }>();

  if (!post || post.user_id !== userId || post.moderation_status !== "removed") {
    return null;
  }

  const { data: decision } = await adminClient
    .from("moderation_audit_logs")
    .select("id")
    .eq("post_id", postId)
    .eq("action", "reject")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return decision?.id ?? null;
}

/**
 * 異議申立て作成時の前提を検証し、期限のスナップショットを返す。
 * DB 側にも guard trigger があるが、API で 4xx を返すためここでも確認する。
 */
/**
 * 異議申立ての前提を検証する。
 *
 * **これは UX のための事前チェックであり、権限境界ではない。** 実際の強制は
 * `create_post_moderation_appeal` RPC と guard trigger が DB 内で行う
 * (レビュー指摘 [P1] 対応)。ここでの検証は、RPC を呼ぶ前に適切な 4xx と
 * 文言を返すためのもの。
 */
export async function resolveAppealPreconditions(
  decisionId: string,
  userId: string,
  adminClientOverride?: ReturnType<typeof createAdminClient>
): Promise<
  | { ok: true; postId: string; deadline: string | null }
  | {
      ok: false;
      reason:
        | "not_found"
        | "already_exists"
        | "expired"
        | "not_removed"
        | "not_current_removal";
    }
> {
  const adminClient = adminClientOverride ?? createAdminClient();
  const detail = await getModerationDecisionForOwner(decisionId, userId, {
    adminClient,
  });

  if (!detail) {
    return { ok: false, reason: "not_found" };
  }
  if (detail.appeal) {
    return { ok: false, reason: "already_exists" };
  }
  if (detail.postModerationStatus !== "removed") {
    return { ok: false, reason: "not_removed" };
  }
  if (
    detail.appealDeadlineAt &&
    Date.now() > new Date(detail.appealDeadlineAt).getTime()
  ) {
    return { ok: false, reason: "expired" };
  }

  // 現在有効な削除判定に対してのみ申し立てられる (REQ-009)。
  // 古い判定への申立てを認めると、その認容が新しい公開停止まで解除してしまう。
  const currentDecisionId = await getCurrentRemovalDecisionId(
    detail.decision.post_id,
    userId,
    adminClient
  );
  if (currentDecisionId !== decisionId) {
    return { ok: false, reason: "not_current_removal" };
  }

  return {
    ok: true,
    postId: detail.decision.post_id,
    deadline: detail.appealDeadlineAt,
  };
}

export interface AdminAppealQueueItem extends AppealRecord {
  appellant_id: string;
  /** 元の公開停止判定を行った運営の user id（独立レビュー警告の判定用）。 */
  original_actor_id: string | null;
  policy_code: string | null;
  author_facing_reason: string | null;
  internal_note: string | null;
  post_image_url: string | null;
  post_storage_path_thumb: string | null;
  hide_thumbnail: boolean;
}

/**
 * 運営向けの異議申立てキュー。
 * こちらは運営専用なので `actor_id` / `internal_note` を含めてよい。
 */
export async function listPendingAppealsForAdmin(
  limit = 50,
  offset = 0,
  adminClientOverride?: ReturnType<typeof createAdminClient>
): Promise<AdminAppealQueueItem[]> {
  const adminClient = adminClientOverride ?? createAdminClient();

  const { data: appeals, error } = await adminClient
    .from("post_moderation_appeals")
    .select(
      "id,post_id,removal_decision_id,appellant_id,status,body,decision_note,decided_at,appeal_deadline_at,created_at"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Moderation] appeal queue fetch failed:", error);
    return [];
  }
  if (!appeals || appeals.length === 0) {
    return [];
  }

  const decisionIds = appeals.map((a) => a.removal_decision_id);
  const postIds = appeals.map((a) => a.post_id);

  const [{ data: decisions }, { data: posts }] = await Promise.all([
    adminClient
      .from("moderation_audit_logs")
      .select("id,actor_id,policy_code,author_facing_reason,internal_note")
      .in("id", decisionIds),
    adminClient
      .from("generated_images")
      .select("id,image_url,storage_path_thumb")
      .in("id", postIds),
  ]);

  const decisionMap = new Map((decisions ?? []).map((d) => [d.id, d]));
  const postMap = new Map((posts ?? []).map((p) => [p.id, p]));

  return appeals.map((appeal) => {
    const decision = decisionMap.get(appeal.removal_decision_id);
    const post = postMap.get(appeal.post_id);
    return {
      ...(appeal as AppealRecord),
      appellant_id: appeal.appellant_id as string,
      original_actor_id: decision?.actor_id ?? null,
      policy_code: decision?.policy_code ?? null,
      author_facing_reason: decision?.author_facing_reason ?? null,
      internal_note: decision?.internal_note ?? null,
      post_image_url: post?.image_url ?? null,
      post_storage_path_thumb: post?.storage_path_thumb ?? null,
      hide_thumbnail: false,
    };
  });
}

/** `create_post_moderation_appeal` RPC が返しうる失敗理由。 */
export type AppealCreateFailure =
  | "duplicate"
  | "not_found"
  | "not_removed"
  | "expired"
  | "not_current_removal"
  | "invalid_body"
  | "unknown";

function classifyAppealCreateError(message: string): AppealCreateFailure {
  if (message.includes("23505") || message.includes("duplicate key")) return "duplicate";
  if (message.includes("appeal_decision_not_found")) return "not_found";
  if (message.includes("appeal_post_not_removed")) return "not_removed";
  if (message.includes("appeal_deadline_passed")) return "expired";
  if (message.includes("appeal_target_not_current_removal")) return "not_current_removal";
  if (message.includes("appeal_body_invalid_length")) return "invalid_body";
  return "unknown";
}

/**
 * 異議申立てを作成する。
 *
 * レビュー指摘 [P1] 対応: 直接 INSERT ではなく `create_post_moderation_appeal`
 * RPC 経由にする。RLS の `WITH CHECK (auth.uid() = appellant_id)` だけでは
 * `status='overturned'` や任意の `appeal_deadline_at` / 長大な `body` を
 * PostgREST から直接書き込めてしまうため、INSERT ポリシーは撤去済み。
 *
 * `appellant_id` / `status` / `appeal_deadline_at` / `post_id` はすべて DB 内で
 * 決定される。対象が「現在有効な削除判定」であることも DB が検証する。
 *
 * RPC はセッションクライアントから呼ぶ（`auth.uid()` を使うため service_role では
 * NULL になり `appeal_auth_required` で弾かれる）。
 */
export async function createAppealAsOwner(params: {
  decisionId: string;
  body: string;
  sessionClientOverride?: Awaited<ReturnType<typeof createClient>>;
}): Promise<
  { ok: true; appealId: string } | { ok: false; reason: AppealCreateFailure }
> {
  const supabase = params.sessionClientOverride ?? (await createClient());

  const { data, error } = await supabase.rpc("create_post_moderation_appeal", {
    p_decision_id: params.decisionId,
    p_body: params.body,
  });

  if (error) {
    const reason = classifyAppealCreateError(
      `${error.code ?? ""} ${error.message ?? ""}`
    );
    if (reason === "unknown") {
      console.error("[Moderation] appeal create RPC failed:", error);
    }
    return { ok: false, reason };
  }

  if (!data) {
    return { ok: false, reason: "unknown" };
  }

  return { ok: true, appealId: data as string };
}

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * モデレーション通知 outbox の健全性。
 *
 * 公開停止の通知は判定と同一トランザクションで outbox に記録し、dispatcher が
 * 配送する。dispatcher が動かないと伝票が溜まり、投稿者が「自分の投稿が
 * 止められたこと」を知らされないまま放置される。
 *
 * 通知が未配送の間は異議申立ての期限が開始しないため投稿者は不利益を被らないが、
 * 気づく手段がないと放置が長期化する。運営が管理画面を開いたときに自然に目に
 * 入るようにするための read model。
 */
export interface ModerationOutboxHealth {
  /** 未配送（再試行待ちを含む）の件数。0 が正常。 */
  pendingCount: number;
  /** 未配送のうち最も古い作成時刻。滞留の長さを見るため。 */
  oldestPendingAt: string | null;
  /** 未配送行の最大試行回数。増え続けていれば恒久的な失敗。 */
  maxAttemptCount: number;
  /** 直近の失敗理由。原因の当たりをつけるため。 */
  lastError: string | null;
  /** 配送済みの累計。動いていることの確認用。 */
  deliveredCount: number;
  /**
   * 最古の未配送行の滞留ミリ秒。取得時点で確定させる。
   *
   * レンダー中に Date.now() を呼ぶと React の純粋性ルールに反する
   * (再レンダーのたびに値が変わりうる) ため、サーバー取得層で固定する。
   */
  oldestPendingAgeMs: number | null;
  /** 取得に失敗した場合 true（カードは「取得できません」と表示する）。 */
  unavailable: boolean;
}

const EMPTY: ModerationOutboxHealth = {
  pendingCount: 0,
  oldestPendingAt: null,
  maxAttemptCount: 0,
  lastError: null,
  deliveredCount: 0,
  oldestPendingAgeMs: null,
  unavailable: false,
};

export async function getModerationOutboxHealth(
  adminClientOverride?: ReturnType<typeof createAdminClient>
): Promise<ModerationOutboxHealth> {
  const adminClient = adminClientOverride ?? createAdminClient();

  const [{ data: pendingRows, error: pendingError }, { count: deliveredCount }] =
    await Promise.all([
      adminClient
        .from("moderation_notification_outbox")
        .select("created_at,attempt_count,last_error")
        .eq("delivery_status", "pending")
        .order("created_at", { ascending: true }),
      adminClient
        .from("moderation_notification_outbox")
        .select("*", { count: "exact", head: true })
        .eq("delivery_status", "delivered"),
    ]);

  if (pendingError) {
    console.error("[Admin] outbox health fetch failed:", pendingError);
    return { ...EMPTY, unavailable: true };
  }

  const rows = pendingRows ?? [];
  if (rows.length === 0) {
    return { ...EMPTY, deliveredCount: deliveredCount ?? 0 };
  }

  // created_at 昇順で取得しているので先頭が最古
  const oldestPendingAt = (rows[0]?.created_at as string) ?? null;
  const maxAttemptCount = rows.reduce(
    (max, row) => Math.max(max, Number(row.attempt_count ?? 0)),
    0
  );
  // 直近に失敗した行のエラーを拾う（試行回数が最も多いもの）
  const lastError =
    rows
      .filter((row) => typeof row.last_error === "string" && row.last_error)
      .sort(
        (a, b) => Number(b.attempt_count ?? 0) - Number(a.attempt_count ?? 0)
      )[0]?.last_error ?? null;

  const oldestAgeMs = oldestPendingAt
    ? Date.now() - new Date(oldestPendingAt).getTime()
    : null;

  return {
    pendingCount: rows.length,
    oldestPendingAt,
    maxAttemptCount,
    lastError: (lastError as string) ?? null,
    deliveredCount: deliveredCount ?? 0,
    oldestPendingAgeMs:
      oldestAgeMs !== null && Number.isFinite(oldestAgeMs) && oldestAgeMs >= 0
        ? oldestAgeMs
        : null,
    unavailable: false,
  };
}

/**
 * 滞留の深刻度。カードの色分けに使う。
 *
 * - ok:      未配送なし
 * - watch:   未配送はあるが新しい（一時的な失敗を再試行中の可能性が高い）
 * - stuck:   30分以上滞留、または試行3回超（恒久的に失敗している）
 */
export type OutboxSeverity = "ok" | "watch" | "stuck";

const STUCK_AFTER_MS = 30 * 60 * 1000;
const STUCK_AFTER_ATTEMPTS = 3;

export function getOutboxSeverity(
  health: ModerationOutboxHealth,
  now: number = Date.now()
): OutboxSeverity {
  if (health.pendingCount === 0) {
    return "ok";
  }
  if (health.maxAttemptCount > STUCK_AFTER_ATTEMPTS) {
    return "stuck";
  }
  if (health.oldestPendingAt) {
    const age = now - new Date(health.oldestPendingAt).getTime();
    if (Number.isFinite(age) && age >= STUCK_AFTER_MS) {
      return "stuck";
    }
  }
  return "watch";
}

// ===============================================
// send-push: 確保した行を送り、結果を記録する流れ
// ===============================================
// DB と FCM は引数で受け取る(index.ts が supabase-js と fetch で作る)。
// Edge Function 本体から分離して Jest から流れをテストできるようにする。
// Deno-only import は使わない。
//
// 計画書: docs/planning/push-notifications-implementation-plan.md Phase 2

import {
  buildDataPayload,
  buildFcmMessage,
  buildLikeTitle,
  type ClaimedRow,
  type FcmOutcome,
  groupRows,
  type PushGroup,
  pushImageSourceFor,
  type PushImageSource,
  resolveCollapseKey,
  resolveText,
  summarizeOutcomes,
} from "./messages.ts";

/** 画像を探す上限。超えたら文字だけで送る */
export const IMAGE_LOOKUP_TIMEOUT_MS = 2500;
export const CLAIM_LIMIT = 100;
// 1 回の呼び出しで回す確保の上限(暴走防止)。残りは次の起動で送る
export const MAX_BATCHES = 5;
// 同時に処理する通数(FCM への送信と、その前の問い合わせ)
export const SEND_CONCURRENCY = 10;
// これを過ぎたら新しい確保も送信も始めない。呼び出し元(push_outbox_kick の
// net.http_post)は 30 秒で待つのをやめるので、それより前に記録して返す。
// 送れなかった行は retry として記録し、次の起動で送る
export const TIME_BUDGET_MS = 25_000;
// 確保した行のうち、送る前に止まった行に残す理由
export const NOT_PROCESSED_ERROR = "not_processed";

export interface DeviceRow {
  id: string;
  user_id: string;
  token: string;
}

export type FinishStatus = "sent" | "skipped" | "failed" | "retry";

export interface FinishItem {
  id: string;
  status: FinishStatus;
  error?: string | null;
}

/** DB の読み書き。失敗は例外ではなく error で返す(supabase-js と同じ) */
export interface PushStore {
  claim(limit: number): Promise<{ rows: ClaimedRow[]; error: string | null }>;
  finish(results: FinishItem[]): Promise<{ error: string | null }>;
  allowedNow(
    userId: string,
    category: string,
  ): Promise<{ allowed: boolean; error: string | null }>;
  devices(userIds: string[]): Promise<{ devices: DeviceRow[]; error: string | null }>;
  /** iOS のバッジに出す未読数。取れなければ null */
  unreadCount(userId: string): Promise<number | null>;
  /** その投稿への未読のいいね数。取れなければ null */
  unreadLikeCount(userId: string, entityId: string): Promise<number | null>;
  nickname(userId: string): Promise<string | null>;
  /** 通知に添える画像の URL。無い・取れなければ null */
  imageUrl(source: PushImageSource): Promise<string | null>;
  /** もう使えないトークンの行を消す。消した行数を返す */
  removeTokens(tokens: string[]): Promise<{ removed: number; error: string | null }>;
}

export interface FcmSender {
  getAccessToken(): Promise<string>;
  /** FCM が 401 を返した時に、使い回しているアクセストークンを捨てる */
  resetAccessToken(): void;
  send(accessToken: string, message: Record<string, unknown>): Promise<FcmOutcome>;
}

export interface SendPushTotals {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retry: number;
  removedTokens: number;
}

export interface SendPushResult {
  ok: boolean;
  error?: "claim_failed" | "finish_failed";
  totals: SendPushTotals;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * items を同時に limit 件まで worker に渡す。worker の例外はログに残して次へ進む
 * (1 件の例外で、ほかの送信中の分を待たずに先へ進まないように)。
 */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runnerCount = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (e) {
        console.error("[send-push] worker failed:", errorMessage(e));
      }
    }
  });
  await Promise.all(runners);
}

export async function runSendPush(
  store: PushStore,
  sender: FcmSender,
  now: () => number = Date.now,
): Promise<SendPushResult> {
  const startedAt = now();
  const overBudget = () => now() - startedAt >= TIME_BUDGET_MS;
  const totals: SendPushTotals = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    retry: 0,
    removedTokens: 0,
  };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    if (overBudget()) break;

    const { rows, error } = await store.claim(CLAIM_LIMIT);
    if (error) {
      console.error("[send-push] claim_push_outbox failed:", error);
      return { ok: false, error: "claim_failed", totals };
    }
    if (rows.length === 0) break;
    totals.claimed += rows.length;

    const results = new Map<string, FinishItem>();
    try {
      await processRows(store, sender, rows, results, totals, overBudget);
    } catch (e) {
      console.error("[send-push] processing failed:", errorMessage(e));
    }
    // 結果の無い行(途中の例外・時間切れで送る前に止まった)は retry にする。
    // 記録しないと processing のまま残り、5 分後に取り直されて、
    // 届いた行まで送り直すことになる
    for (const row of rows) {
      if (!results.has(row.id)) {
        results.set(row.id, { id: row.id, status: "retry", error: NOT_PROCESSED_ERROR });
      }
    }
    const items = [...results.values()];

    if (!(await finishWithRetry(store, items))) {
      return { ok: false, error: "finish_failed", totals };
    }
    for (const item of items) totals[item.status] += 1;

    if (rows.length < CLAIM_LIMIT) break;
  }

  return { ok: true, totals };
}

/**
 * 結果の記録は 1 回だけやり直す。finish_push_outbox は processing の行だけを
 * 書き換えるので、1 回目が実は通っていても 2 回目は何もしない。
 */
async function finishWithRetry(store: PushStore, items: FinishItem[]): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await store.finish(items);
    if (!error) return true;
    console.error(`[send-push] finish_push_outbox failed (attempt ${attempt}):`, error);
  }
  // 記録できなかった行は 5 分後に再確保される(二重送信になりうるが取りこぼすよりよい)
  return false;
}

async function processRows(
  store: PushStore,
  sender: FcmSender,
  rows: ClaimedRow[],
  results: Map<string, FinishItem>,
  totals: SendPushTotals,
  overBudget: () => boolean,
): Promise<void> {
  // 1. 受け手の設定で送らないものを除く(種類オフ・一時停止・止める時間帯)
  const allowedByKey = new Map<string, { allowed: boolean; error: string | null }>();
  const keyOf = (row: ClaimedRow) => `${row.recipient_id}\u0000${row.category}`;
  const keys = [...new Map(rows.map((row) => [keyOf(row), row])).values()];
  await mapWithConcurrency(keys, SEND_CONCURRENCY, async (row) => {
    allowedByKey.set(keyOf(row), await store.allowedNow(row.recipient_id, row.category));
  });

  const allowedRows: ClaimedRow[] = [];
  for (const row of rows) {
    const check = allowedByKey.get(keyOf(row));
    if (!check) continue; // 問い合わせが例外で終わった行は結果なし → retry
    if (check.error) {
      console.error("[send-push] push_allowed_now failed:", check.error);
      results.set(row.id, { id: row.id, status: "retry", error: `allowed_check: ${check.error}` });
    } else if (check.allowed) {
      allowedRows.push(row);
    } else {
      results.set(row.id, { id: row.id, status: "skipped", error: "preference" });
    }
  }
  if (allowedRows.length === 0) return;

  const groups = groupRows(allowedRows);
  const recipientIds = [...new Set(groups.map((g) => g.recipientId))];

  const setGroupResult = (group: PushGroup, status: FinishStatus, error: string | null) => {
    for (const id of group.rowIds) results.set(id, { id, status, error });
  };

  // 2. 宛先(端末)
  const { devices, error: deviceError } = await store.devices(recipientIds);
  if (deviceError) {
    console.error("[send-push] device lookup failed:", deviceError);
    for (const g of groups) setGroupResult(g, "retry", `devices: ${deviceError}`);
    return;
  }
  const devicesByUser = new Map<string, DeviceRow[]>();
  for (const d of devices) {
    const list = devicesByUser.get(d.user_id) ?? [];
    list.push(d);
    devicesByUser.set(d.user_id, list);
  }

  // 3. iOS のバッジに出す未読数(受け手ごとに 1 回)
  const badges = new Map<string, number | null>();
  await mapWithConcurrency(
    recipientIds.filter((userId) => devicesByUser.has(userId)),
    SEND_CONCURRENCY,
    async (userId) => {
      badges.set(userId, await store.unreadCount(userId));
    },
  );

  let accessToken: string;
  try {
    accessToken = await sender.getAccessToken();
  } catch (e) {
    const message = errorMessage(e);
    console.error("[send-push] access token failed:", message);
    for (const g of groups) setGroupResult(g, "retry", message);
    return;
  }

  // 4. 1 通ずつ送る(同時に SEND_CONCURRENCY 通まで)。時間切れのあとは新しく始めない
  //    (始めなかった分は結果なし → 呼び出し側で retry)
  const invalidTokens = new Set<string>();
  await mapWithConcurrency(groups, SEND_CONCURRENCY, async (group) => {
    if (overBudget()) return;

    const outcomes: FcmOutcome[] = [];
    try {
      const devices = devicesByUser.get(group.recipientId) ?? [];
      // 題名(いいねのまとめ)と画像は互いに関係ないので並べて待つ。端末が無ければ画像は探さない
      const [likeTitle, imageUrl] = await Promise.all([
        resolveLikeTitle(store, group),
        devices.length > 0 ? resolveImageUrl(store, group.latest) : Promise.resolve(null),
      ]);
      const { title, body } = resolveText(group.latest, likeTitle);
      const data = buildDataPayload(group.latest);
      const collapseKey = resolveCollapseKey(group);

      for (const device of devices) {
        const message = buildFcmMessage({
          token: device.token,
          title,
          body,
          data,
          category: group.category,
          collapseKey,
          badge: badges.get(group.recipientId) ?? null,
          imageUrl,
        });
        const outcome = await sender.send(accessToken, message);
        if (outcome.kind === "invalid_token") invalidTokens.add(device.token);
        // 鍵の差し替え直後など。次の確保(次の起動)でアクセストークンを作り直す
        if (outcome.kind === "unauthorized") sender.resetAccessToken();
        outcomes.push(outcome);
      }
    } catch (e) {
      // 途中で落ちても、届いた端末があれば sent、無ければやり直す
      outcomes.push({ kind: "retry", error: `exception: ${errorMessage(e)}` });
    }

    const summary = summarizeOutcomes(outcomes);
    setGroupResult(group, summary.status, summary.error);
  });

  // 5. もう使えない宛先を消す(アプリの削除・トークンの失効)。
  //    token は UNIQUE なので token で消す。行の id で消すと、送ったあとに同じ端末が
  //    新しいトークンを登録していた場合(同じ行が書き換わる)、新しい宛先まで消える
  if (invalidTokens.size > 0) {
    const { removed, error } = await store.removeTokens([...invalidTokens]);
    if (error) {
      console.error("[send-push] removing invalid tokens failed:", error);
    } else {
      totals.removedTokens += removed;
    }
  }
}

/**
 * いいねは「〇〇ほか N 人が…」にまとめる。N はその投稿の未読のいいね数。
 * 端末は collapse_key で前の通知を置き換えるので、今回確保した分ではなく総数で書く。
 */
async function resolveLikeTitle(store: PushStore, group: PushGroup): Promise<string | null> {
  const row = group.latest;
  if (row.notification_type !== "like" || !row.notification_entity_id) return null;

  const count = await store.unreadLikeCount(group.recipientId, row.notification_entity_id);
  if (!count || count <= 1) return null;

  const nickname = row.notification_actor_id
    ? await store.nickname(row.notification_actor_id)
    : null;
  return buildLikeTitle(nickname, count);
}

/**
 * 通知に添える画像。画像は飾りなので、取れなくても文字だけで送る
 * (ここで失敗して通知そのものが遅れたり届かなかったりしないように)。
 */
async function resolveImageUrl(store: PushStore, row: ClaimedRow): Promise<string | null> {
  const source = pushImageSourceFor(row);
  if (!source) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // DB が重いときに、飾りの画像のせいで通知そのものが遅れないよう上限を付ける
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timeout after ${IMAGE_LOOKUP_TIMEOUT_MS}ms`)),
        IMAGE_LOOKUP_TIMEOUT_MS,
      );
    });
    return await Promise.race([store.imageUrl(source), timeout]);
  } catch (e) {
    console.error("[send-push] image lookup failed:", errorMessage(e));
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

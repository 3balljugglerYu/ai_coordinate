/**
 * 投稿インプレッションのクライアント送信バッファ
 * (計画書: docs/planning/post-impressions-implementation-plan.md)
 *
 * PostCard / PostFeedCard が viewable(可視50%×1秒)を達成した image_id をここに積み、
 * デバウンスで `POST /api/posts/impressions/batch` へまとめて送る。
 * ページ離脱時(visibilitychange: hidden / pagehide)は sendBeacon で flush する。
 *
 * 過剰加算ガード(ADR-002/003):
 * - sessionStorage(`post-impressions-sent-v1`)に「最後に送った時刻」を持ち、
 *   30分経つまで同じ投稿を再送しない。キュー投入時点で記録するため、
 *   StrictMode 二重実行・BFCache 復帰・再マウントでも二重送信しない
 *   (送信失敗時の取りこぼしは DB dedup と次の窓に委ねる)。
 * - サーバ側でも (image_id, viewer_key, window_start) UNIQUE が最終防波堤。
 *
 * ここの抑止(前回送信から30分)は DB の固定枠より厳しい。緩い側にすると
 * 枠をまたいだ瞬間に連続で送れてしまうため、意図的にこの向きにしている。
 */

import { isPostImpressionsEnabled } from "@/lib/env";

/** どこで見られたか。DB の post_impressions.view_mode と対応する。 */
export type ImpressionViewMode = "grid" | "feed" | "detail";

const SESSION_KEY = "post-impressions-sent-v1";
const BATCH_ENDPOINT = "/api/posts/impressions/batch";
/** デバウンス間隔。スクロール中でもこの間隔ごとにまとめて送る。 */
const FLUSH_DEBOUNCE_MS = 1500;
/** API/RPC の上限(100)に合わせた1回あたりの最大送信件数。 */
const MAX_BATCH_SIZE = 100;
/** 再送を許すまでの間隔。SQL 側の 30分固定枠(floor(epoch/1800))と対になる。 */
export const IMPRESSION_WINDOW_MS = 30 * 60 * 1000;

type SentMap = Record<string, number>;

function readSentMap(): SentMap {
  if (typeof window === "undefined") {
    return {};
  }
  // sessionStorage はプロパティアクセス自体が SecurityError を投げ得る
  // (Cookie無効設定・一部のプライベートモード等)ため、全体を try-catch で守る。
  // 読めない環境では空(=セッションdedupなし)にフォールバックし、
  // 整合性は DB の UNIQUE(最終防波堤)に委ねる。
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    // 旧形式(ID の配列)は送信時刻を持たないので捨てる。デプロイをまたいだ
    // セッションで1投稿につき最大1回多く送るだけで、DB dedup が吸収する。
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: SentMap = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) {
        result[id] = at;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeSentMap(map: SentMap): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage 不可(プライベートモード等)でも計測は継続する
    // (このセッション中の dedup はモジュール内 Map が担う)。
  }
}

/** 期限切れの記録を落とす(長時間セッションで際限なく肥大化させない)。 */
function pruneExpired(map: SentMap, now: number): SentMap {
  const pruned: SentMap = {};
  for (const [id, at] of Object.entries(map)) {
    if (now - at < IMPRESSION_WINDOW_MS) {
      pruned[id] = at;
    }
  }
  return pruned;
}

// モジュールスコープの送信バッファ(ホーム滞在中に跨って共有)。
// 表示形式を切り替えた直後は grid と feed が混ざり得るので、投稿ごとに保持する。
const pending = new Map<string, ImpressionViewMode>();
let flushTimer: number | null = null;
let lifecycleRegistered = false;

function sendBatch(
  imageIds: string[],
  viewMode: ImpressionViewMode,
  useBeacon: boolean
): void {
  const payload = JSON.stringify({ image_ids: imageIds, view_mode: viewMode });

  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const ok = navigator.sendBeacon(
      BATCH_ENDPOINT,
      new Blob([payload], { type: "application/json" }),
    );
    if (ok) {
      return;
    }
    // beacon がキューに乗らなかった場合は keepalive fetch にフォールバック。
  }

  // 失敗は静かに握りつぶす(EARS-07)。DB dedup が整合性を守るため再送管理はしない。
  void fetch(BATCH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

/** バッファの内容を送信する。離脱時は useBeacon=true で呼ぶ。 */
export function flushPostImpressions(useBeacon = false): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.size === 0) {
    return;
  }

  // 表示形式ごとに分けて送る(1リクエスト1 view_mode)。
  const byMode = new Map<ImpressionViewMode, string[]>();
  for (const [imageId, viewMode] of pending) {
    const ids = byMode.get(viewMode);
    if (ids) {
      ids.push(imageId);
    } else {
      byMode.set(viewMode, [imageId]);
    }
  }
  pending.clear();

  for (const [viewMode, ids] of byMode) {
    for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
      sendBatch(ids.slice(i, i + MAX_BATCH_SIZE), viewMode, useBeacon);
    }
  }
}

function registerLifecycleFlush(): void {
  if (lifecycleRegistered || typeof window === "undefined") {
    return;
  }
  lifecycleRegistered = true;
  // タブ非表示/離脱時に未送信分を beacon で flush する(EARS-05)。
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPostImpressions(true);
    }
  });
  window.addEventListener("pagehide", () => {
    flushPostImpressions(true);
  });
}

/**
 * viewable 達成した投稿をバッファに積む(前回送信から30分経ったもののみ)。
 * デバウンス後にまとめて送信される。
 */
export function queuePostImpression(
  imageId: string,
  viewMode: ImpressionViewMode
): void {
  if (typeof window === "undefined" || !isPostImpressionsEnabled()) {
    return;
  }
  if (!imageId || pending.has(imageId)) {
    return;
  }

  const now = Date.now();
  const sent = readSentMap();
  const lastSentAt = sent[imageId];
  if (typeof lastSentAt === "number" && now - lastSentAt < IMPRESSION_WINDOW_MS) {
    return;
  }
  // キュー投入時点で「送信済み」として記録する(二重送信防止を最優先)。
  const next = pruneExpired(sent, now);
  next[imageId] = now;
  writeSentMap(next);

  pending.set(imageId, viewMode);
  registerLifecycleFlush();

  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushPostImpressions(false);
    }, FLUSH_DEBOUNCE_MS);
  }
}

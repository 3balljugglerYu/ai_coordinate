/**
 * 投稿インプレッションのクライアント送信バッファ
 * (計画書: docs/planning/post-impressions-implementation-plan.md)
 *
 * PostCard が viewable(可視50%×1秒)を達成した image_id をここに積み、
 * デバウンスで `POST /api/posts/impressions/batch` へまとめて送る。
 * ページ離脱時(visibilitychange: hidden / pagehide)は sendBeacon で flush する。
 *
 * 過剰加算ガード(ADR-002/003):
 * - sessionStorage(`post-impressions-sent-v1`)で「このセッションで送信済み」を抑止。
 *   キュー投入時点で記録するため、StrictMode 二重実行・BFCache 復帰・再マウントでも
 *   二重送信しない(送信失敗時の取りこぼしは DB 日次 dedup と翌セッションに委ねる)。
 * - サーバ側でも (image_id, viewer_key, event_date) UNIQUE が最終防波堤。
 */

import { isPostImpressionsEnabled } from "@/lib/env";

const SESSION_KEY = "post-impressions-sent-v1";
const BATCH_ENDPOINT = "/api/posts/impressions/batch";
/** デバウンス間隔。スクロール中でもこの間隔ごとにまとめて送る。 */
const FLUSH_DEBOUNCE_MS = 1500;
/** API/RPC の上限(100)に合わせた1回あたりの最大送信件数。 */
const MAX_BATCH_SIZE = 100;

function readSentIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    return new Set<string>();
  }
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeSentIds(ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // sessionStorage 不可(プライベートモード等)でも計測は継続する
    // (このセッション中の dedup はモジュール内 Set が担う)。
  }
}

// モジュールスコープの送信バッファ(ホーム滞在中に跨って共有)。
const pending = new Set<string>();
let flushTimer: number | null = null;
let lifecycleRegistered = false;

function sendBatch(imageIds: string[], useBeacon: boolean): void {
  const payload = JSON.stringify({ image_ids: imageIds });

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
  const ids = Array.from(pending);
  pending.clear();
  for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
    sendBatch(ids.slice(i, i + MAX_BATCH_SIZE), useBeacon);
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
 * viewable 達成した投稿をバッファに積む(セッション内で未送信のもののみ)。
 * デバウンス後にまとめて送信される。
 */
export function queuePostImpression(imageId: string): void {
  if (typeof window === "undefined" || !isPostImpressionsEnabled()) {
    return;
  }
  if (!imageId || pending.has(imageId)) {
    return;
  }

  const sent = readSentIds();
  if (sent.has(imageId)) {
    return;
  }
  // キュー投入時点で「送信済み」として記録する(二重送信防止を最優先)。
  sent.add(imageId);
  writeSentIds(sent);

  pending.add(imageId);
  registerLifecycleFlush();

  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushPostImpressions(false);
    }, FLUSH_DEBOUNCE_MS);
  }
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { HALLOWEEN_BEST_SHOT, isHalloweenBestShotOpen } from "../halloween-best-shot";

/**
 * ハロウィン企画の対象作品か(画像の左上のラベルと、企画仕様の「このカタログで生成する」)。
 * 2026-10-16 ユーザー指示: 簡単お着替えなど対象でない作品から生成してしまう人がいるので、
 * 対象作品を見た目で分かるようにする。
 *
 * - 出すのは**期間中**、**日本語の画面**だけ(企画は日本国内向けで、企画ページも日本語だけ)
 * - 対象作品の ID は /api/hashtag-campaigns/[key]/targets から1回だけ取り、カードどうしで使い回す
 *   (カードごとに問い合わせない)。数分たったら次に使われたときに取り直す
 * - 取れなければ空のまま(普段の見た目になるだけ)
 *
 * 期間はブラウザの時刻で見る。サーバーで描いた HTML とは、ハイドレーションのあとで食い違わないように
 * useSyncExternalStore のサーバー用の値(期間外・空)から始める。
 */

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** 取り直すまでの間隔。サーバー側も数分のキャッシュなので、これより細かく取っても変わらない */
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

let targetIds: ReadonlySet<string> = EMPTY_IDS;
let fetchedAtMs: number | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribeTargetIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getTargetIdsSnapshot(): ReadonlySet<string> {
  return targetIds;
}

function getServerTargetIdsSnapshot(): ReadonlySet<string> {
  return EMPTY_IDS;
}

/** 期間は時刻で変わるだけなので、知らせる相手はいない */
function subscribeNothing(): () => void {
  return () => {};
}

function getIsOpenSnapshot(): boolean {
  return isHalloweenBestShotOpen(Date.now());
}

function getServerIsOpenSnapshot(): boolean {
  return false;
}

function refreshTargetIds(): void {
  if (inflight) {
    return;
  }
  if (fetchedAtMs !== null && Date.now() - fetchedAtMs < REFRESH_INTERVAL_MS) {
    return;
  }

  inflight = fetch(
    `/api/hashtag-campaigns/${encodeURIComponent(HALLOWEEN_BEST_SHOT.campaignKey)}/targets`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => {
      const postIds = (body as { postIds?: unknown } | null)?.postIds;
      if (!Array.isArray(postIds)) {
        return;
      }
      targetIds = new Set(postIds.filter((id): id is string => typeof id === "string"));
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      // ラベルとボタンが普段の見た目になるだけ。画面は止めない
    })
    .finally(() => {
      fetchedAtMs = Date.now();
      inflight = null;
    });
}

/** 期間中・日本語の画面なら対象作品の ID、それ以外は空 */
export function useHalloweenTargetPostIds(): ReadonlySet<string> {
  const locale = useLocale();
  const isOpen = useSyncExternalStore(
    subscribeNothing,
    getIsOpenSnapshot,
    getServerIsOpenSnapshot,
  );
  const isShown = isOpen && locale === "ja";
  const ids = useSyncExternalStore(
    subscribeTargetIds,
    getTargetIdsSnapshot,
    getServerTargetIdsSnapshot,
  );

  useEffect(() => {
    if (isShown) {
      refreshTargetIds();
    }
  }, [isShown]);

  return isShown ? ids : EMPTY_IDS;
}

/** この投稿がハロウィン企画の対象作品か(期間中・日本語の画面だけ true になりうる) */
export function useIsHalloweenTarget(postId: string | null | undefined): boolean {
  const ids = useHalloweenTargetPostIds();
  return !!postId && ids.has(postId);
}

/** テスト用: 取り込んだ ID と取得の記録を消す */
export function resetHalloweenTargetsForTest(): void {
  targetIds = EMPTY_IDS;
  fetchedAtMs = null;
  inflight = null;
  listeners.clear();
}

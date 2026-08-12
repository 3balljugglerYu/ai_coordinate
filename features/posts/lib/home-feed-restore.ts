"use client";

/**
 * ホーム一覧の「戻ったとき元の場所に居る」ための保存領域。
 *
 * ## なぜ要るか
 *
 * 追加読み込みぶんの投稿は `PostList` の state にしかない。投稿詳細へ遷移すると
 * ページセグメントがアンマウントされて消え、戻ると初期20件ぶんの高さしか無い。
 * ブラウザ(と Next.js)のスクロール復元は**復元先の高さがある前提**で動くので、
 * 保存された位置まで戻れず上の方へ丸められる。復元すべきはスクロール位置ではなく
 * **一覧そのもの**。
 *
 * ## なぜモジュール変数か
 *
 * 必要なのは「アンマウントをまたいでデータが生き残ること」の一点。
 * モジュールスコープの値はページの再読み込みまで生き続けるため、これで足りる。
 * レイアウト配下の Provider でも同じ寿命になるが、その場合は
 * LocaleShell に手を入れることになる。得るものが同じなら小さい方を採る。
 *
 * ## なぜ件数を間引かないか
 *
 * 「保持は最大◯件」で先頭を捨てると**また高さが足りなくなり**、直したい症状に戻る。
 * 投稿1件は1〜2KB程度なので、200件持っても誤差。上限は設けない。
 */

import type { Post, SortType } from "../types";
import type { HomeViewMode } from "./home-view-preference";

export interface HomeFeedRestoreSnapshot {
  posts: Post[];
  offset: number;
  hasMore: boolean;
  sortType: SortType;
  viewMode: HomeViewMode;
  searchQuery: string;
  /** 直前にタップした投稿。復元位置の基準にする。 */
  anchorPostId: string | null;
  /** タップ時点の、その投稿カードの画面内での上端位置。 */
  anchorTop: number;
  /** anchor が見つからなかったときの保険。 */
  scrollY: number;
  savedAt: number;
}

/**
 * 古い一覧を復元しない猶予。
 * 長く放置したあとの「ホーム」は、続きより新着が見たいはず。
 */
export const HOME_FEED_RESTORE_TTL_MS = 30 * 60 * 1000;

let snapshot: HomeFeedRestoreSnapshot | null = null;

export function saveHomeFeedRestoreSnapshot(
  next: Omit<HomeFeedRestoreSnapshot, "savedAt">
): void {
  snapshot = { ...next, savedAt: Date.now() };
}

export function clearHomeFeedRestoreSnapshot(): void {
  snapshot = null;
}

/**
 * 復元に使える保存があれば返す(**消さない**)。
 *
 * 消さないのは、React の初期化関数が開発時に2回走るため。
 * ここで消すと2回目が null になり、一覧が空で描画されてしまう。
 * 破棄は復元し終わったあとに呼び出し側が `clear` で行う。
 */
export function peekHomeFeedRestoreSnapshot(match: {
  sortType: SortType;
  searchQuery: string;
}): HomeFeedRestoreSnapshot | null {
  if (!snapshot) {
    return null;
  }
  if (Date.now() - snapshot.savedAt > HOME_FEED_RESTORE_TTL_MS) {
    snapshot = null;
    return null;
  }
  // 並び替えや検索語が違えば別の一覧。復元してはいけない
  if (
    snapshot.sortType !== match.sortType ||
    snapshot.searchQuery !== match.searchQuery
  ) {
    return null;
  }
  // 初期20件しか無い状態を復元しても意味がない(むしろ新着を隠す)
  if (snapshot.posts.length <= 20) {
    return null;
  }
  return snapshot;
}

/** スクロール補正を打ち切るまでの上限。画像の読み込みで高さが動くため数フレーム粘る。 */
const MAX_CORRECTION_FRAMES = 40;
/** この差までは合っているとみなす(端数で延々と補正し続けない)。 */
const SETTLED_PX = 1;
/** 連続で合っていたら早めに終わる。 */
const SETTLED_FRAMES = 3;

/**
 * 保存した位置へ戻す。
 *
 * `scrollY` を直接あてるより、**タップした投稿を基準に差分で寄せる**方がズレに強い。
 * 画像の遅延読み込み・フォント・上部バナー・グリッド↔フィードの切替で
 * 絶対位置は簡単に変わるが、「あのカードが画面のこの高さにあった」は保たれる。
 *
 * ユーザーが操作を始めたら即座にやめる(指の下で画面が動くのが最悪の体験)。
 *
 * @returns 後始末の関数
 */
export function restoreHomeFeedScroll(
  target: Pick<HomeFeedRestoreSnapshot, "anchorPostId" | "anchorTop" | "scrollY">
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;
  let frames = 0;
  let settled = 0;
  let rafId = 0;

  const cancel = () => {
    cancelled = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const userEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  for (const type of userEvents) {
    window.addEventListener(type, cancel, { passive: true, once: true });
  }

  const step = () => {
    if (cancelled) {
      return;
    }
    frames += 1;

    const anchor = target.anchorPostId
      ? document.querySelector<HTMLElement>(
          `[data-post-id="${CSS.escape(target.anchorPostId)}"]`
        )
      : null;

    if (anchor) {
      const diff = anchor.getBoundingClientRect().top - target.anchorTop;
      if (Math.abs(diff) <= SETTLED_PX) {
        settled += 1;
      } else {
        settled = 0;
        window.scrollBy({ top: diff });
      }
    } else if (frames === 1) {
      // anchor がまだ描画されていない/削除された場合の保険
      window.scrollTo({ top: target.scrollY });
    }

    if (settled >= SETTLED_FRAMES || frames >= MAX_CORRECTION_FRAMES) {
      cancel();
      return;
    }
    rafId = window.requestAnimationFrame(step);
  };

  rafId = window.requestAnimationFrame(step);

  return () => {
    cancel();
    for (const type of userEvents) {
      window.removeEventListener(type, cancel);
    }
  };
}

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

const STORAGE_KEY = "persta-ai:home-feed-restore-v1";

let snapshot: HomeFeedRestoreSnapshot | null = null;

/**
 * sessionStorage にも控える理由。
 *
 * モジュール変数はページを読み込み直すと消える。開発中は Fast Refresh でも
 * 消えるため「保存したのに復元されない」が起きて原因を見誤る(実際に嵌まった)。
 * 控えておけばリロードやタブ復帰でも位置が戻り、開発時の挙動も本番と揃う。
 * 書き込みは best-effort(容量超過・storage 不可でも計測ではないので落とさない)。
 */
function persist(value: HomeFeedRestoreSnapshot | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 容量超過やプライベートモード。モジュール変数だけで動く
  }
}

function readPersisted(): HomeFeedRestoreSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as HomeFeedRestoreSnapshot;
    // 最低限の形だけ見る(古い版・壊れた値で描画を壊さない)
    if (!Array.isArray(parsed?.posts) || typeof parsed?.savedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveHomeFeedRestoreSnapshot(
  next: Omit<HomeFeedRestoreSnapshot, "savedAt">
): void {
  snapshot = { ...next, savedAt: Date.now() };
  persist(snapshot);
}

export function clearHomeFeedRestoreSnapshot(): void {
  snapshot = null;
  persist(null);
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
  // モジュール変数が空でも、同じタブの控えがあれば使う
  // (リロード・タブ復帰・開発時の Fast Refresh をまたぐ)
  if (!snapshot) {
    snapshot = readPersisted();
  }
  if (!snapshot) {
    return null;
  }
  if (Date.now() - snapshot.savedAt > HOME_FEED_RESTORE_TTL_MS) {
    clearHomeFeedRestoreSnapshot();
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

/**
 * 補正を続ける時間。
 *
 * フレーム数で打ち切ると、**画像が読み込まれ終わる前に諦める**。
 * 実測では 40 フレーム(≒0.65秒)では足りず、1,400px ほどズレたまま終わっていた。
 * 「数フレーム安定したら終わり」も同じ理由で使わない(読み込みの谷間で
 * 一瞬安定して見えるため)。指が触れたら即やめるので、長めでも害はない。
 */
const MAX_CORRECTION_MS = 3000;
/** この差までは合っているとみなす(端数で延々と scrollBy し続けない)。 */
const SETTLED_PX = 1;

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
  let rafId = 0;
  const startedAt = Date.now();

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
      // ズレていれば毎フレーム寄せ直す。上の画像が読み込まれるたびに
      // カードは押し下げられるので、追いかけ続けないと最後にズレて終わる
      if (Math.abs(diff) > SETTLED_PX) {
        window.scrollBy({ top: diff });
      }
    } else if (frames === 1) {
      // anchor がまだ描画されていない/削除された場合の保険
      window.scrollTo({ top: target.scrollY });
    }

    if (Date.now() - startedAt >= MAX_CORRECTION_MS) {
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

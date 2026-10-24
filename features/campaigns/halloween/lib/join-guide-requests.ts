/**
 * 「参加方法の、この部門の詳しい作成手順を開いて」という合図(2026-10-24 ユーザー指示)。
 *
 * 対象作品の上のエントリーのカードは短くして「詳しくはこちら」だけ置く。押したら、参加方法の
 * タブ(JoinTabs)をその部門に切り替え、閉じている作成手順(JoinDetails)を開く。
 * カードとタブ・手順はページの離れた場所にあるので、合図で伝える。
 */

/** 参加方法のエンジョイ部門のタブの key */
export const ENJOY_JOIN_TAB_KEY = "user";

const listeners = new Set<(tabKey: string) => void>();

export function requestJoinGuide(tabKey: string): void {
  for (const listener of listeners) {
    listener(tabKey);
  }
}

export function subscribeJoinGuideRequests(listener: (tabKey: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

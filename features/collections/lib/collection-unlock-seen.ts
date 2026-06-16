/**
 * 解放お知らせ(初回モーダル/段階解放モーダル)の「前回見た解放数」を localStorage で管理する。
 *
 * カテゴリ key ごとに「最後に表示した解放数」を保存し、現在の解放数がそれを上回ったときだけ
 * お知らせを出す(= 同じ解放では再表示しない)。ホームの `PetitUnlockAnnouncer` と、進捗モーダル
 * クローズ後に出す `CollectionUnlockDripListener` の双方で共有する。
 */
const STORAGE_KEY = "persta:collection-unlock-seen-v1";

type SeenMap = Record<string, number>;

function readSeenMap(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SeenMap;
    }
    return {};
  } catch {
    return {};
  }
}

/** 前回見た解放数を返す。未記録は null(= 初回)。 */
export function getUnlockSeen(categoryKey: string): number | null {
  const map = readSeenMap();
  return Object.prototype.hasOwnProperty.call(map, categoryKey)
    ? map[categoryKey]
    : null;
}

/** 表示後に「見た解放数」を現在値へ更新する。 */
export function writeUnlockSeen(categoryKey: string, unlockedCount: number): void {
  if (typeof window === "undefined") return;
  try {
    const map = readSeenMap();
    map[categoryKey] = unlockedCount;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage 不可(プライベートモード等)でも致命ではない。お知らせは出ないだけ。
  }
}

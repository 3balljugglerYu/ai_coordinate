import {
  GENERATION_MODE_PATHS,
  getLastGenerationModePath,
  isGenerationModePath,
} from "@/features/generation/lib/generation-mode-preference";
import {
  TUTORIAL_TOUR_ENTRY_PATH,
  isTutorialTourInProgress,
} from "@/features/tutorial/lib/tutorial-status";

/**
 * ボトムナビ(`NavigationBar`)と PC のサイドバー(`AppSidebar`)で共通の、
 * 「生成の入口」と「カタログ」の扱い。両方に同じ判定を書くと片方だけ直す事故が
 * 起きるので、ここに集める。
 *
 * カタログ刷新(段階公開中は運営のみ。`useStylesCatalogRevamp`)の前後で変わる。
 *  - 刷新前: 生成の入口は「コーディネート」。押すと前回使った生成モードへ戻る。
 *    /coordinate と /style で選択中にする
 *  - 刷新後: 生成の入口は「つくる」。押すと毎回 Free Style を開く。
 *    /coordinate・/style・/free のどこでも選択中にする。
 *    ホームの右に「カタログ」(/styles)が加わり、/styles・/user-styles で選択中にする
 */

/** 生成の入口(コーディネート / つくる)の項目を表すパス。遷移先は押したときに決める。 */
export const GENERATION_ENTRY_PATH = "/coordinate";

/** カタログの項目のパス(Persta.AI ORIGINAL)。刷新後だけナビに出す。 */
export const CATALOG_ENTRY_PATH = "/styles";

/**
 * 生成の入口を押したときの遷移先(ロケール無しのパス)。
 *
 * チュートリアルツアーの進行中は、刷新の前後を問わずツアーの目的地
 * (One-Tap Style)へ固定する。ツアーの続きはその画面にあり、他のモードへ
 * 流すとツアーが再開できずに詰まる。
 */
export function resolveGenerationEntryPath(isCatalogRevamp: boolean): string {
  if (isTutorialTourInProgress()) {
    return TUTORIAL_TOUR_ENTRY_PATH;
  }
  return isCatalogRevamp
    ? GENERATION_MODE_PATHS.free
    : getLastGenerationModePath();
}

/**
 * ナビの項目を選択中として表示するか。
 *
 * @param itemPath 項目のパス(ロケール無し)
 * @param activePathname 今いる(または遷移中の)パス(ロケール無し)
 */
export function isNavItemActive(
  itemPath: string,
  activePathname: string,
  isCatalogRevamp: boolean
): boolean {
  if (activePathname === itemPath) {
    return true;
  }
  if (itemPath === GENERATION_ENTRY_PATH) {
    // 生成モード全体の入口として扱う
    return isCatalogRevamp
      ? isGenerationModePath(activePathname)
      : activePathname === GENERATION_MODE_PATHS.style;
  }
  if (itemPath === CATALOG_ENTRY_PATH) {
    // User ORIGINAL と、スタイルの個別ページもカタログの中として扱う
    return (
      activePathname === "/user-styles" ||
      activePathname.startsWith(`${CATALOG_ENTRY_PATH}/`)
    );
  }
  return false;
}

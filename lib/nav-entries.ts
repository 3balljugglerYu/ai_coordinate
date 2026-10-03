import { LayoutGrid, Sparkles, type LucideIcon } from "lucide-react";
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
 * どちらの項目がナビに出るかは、カタログ刷新(段階公開中は運営のみ。
 * `useStylesCatalogRevamp`)で決まる。出す・出さないはナビの側が決めるので、
 * ここの判定は刷新の状態を見ない。
 *  - 刷新前: 生成の入口は「コーディネート」。押すと前回使った生成モードへ戻る。
 *    /style で選択中にする
 *  - 刷新後: 生成の入口を「カタログ」(/styles)1つにまとめる(「つくる」は無い)。
 *    Free Style はカタログの中の「カタログをつくる」タブになるので、
 *    /styles・/user-styles・/styles/[slug] に加えて /free・/style でも選択中にする
 *    (docs/planning/catalog-three-tabs-implementation-plan.md ADR-004)
 *
 * 生成モード Coordinate(/coordinate)は廃止し、Free Style へ転送している
 * (docs/planning/coordinate-mode-deprecation-plan.md)。入口はもう /coordinate を開かない。
 */

/**
 * 生成の入口(コーディネート)の項目を表す識別子。刷新前だけナビに出す。
 *
 * 値は廃止した /coordinate のままだが、ルートとしては使わない。押すと必ず
 * resolveGenerationEntryPath で行き先を決め直す(NavigationBar / AppSidebar の
 * handleNavigation)。
 */
export const GENERATION_ENTRY_PATH = "/coordinate";

/** カタログの項目のパス(Perstaのカタログ)。刷新後だけナビに出す。 */
export const CATALOG_ENTRY_PATH = "/styles";

/**
 * 生成の入口(コーディネート)を押したときの遷移先(ロケール無しのパス)。
 *
 * チュートリアルツアーの進行中は、ツアーの目的地(One-Tap Style)へ固定する。
 * ツアーの続きはその画面にあり、他のモードへ流すとツアーが再開できずに詰まる。
 */
export function resolveGenerationEntryPath(): string {
  if (isTutorialTourInProgress()) {
    return TUTORIAL_TOUR_ENTRY_PATH;
  }
  return getLastGenerationModePath();
}

/**
 * カタログを押したときの遷移先(ロケール無しのパス)。
 *
 * ⭐ 刷新後はナビに生成の入口が無く、ツアーの最初の一歩は「カタログ」を指す。
 * ツアーの続き(スタイル選び → キャラ → 生成)は One-Tap Style にあるので、
 * ツアー中はそこへ固定する。/styles を開くとツアーが止まる。
 */
export function resolveCatalogEntryPath(): string {
  if (isTutorialTourInProgress()) {
    return TUTORIAL_TOUR_ENTRY_PATH;
  }
  return CATALOG_ENTRY_PATH;
}

/**
 * ナビの項目を押したときの行き先(ロケール無しのパス)。押したときに行き先を決め直す
 * 項目(生成の入口・カタログ)だけ行き先を返し、それ以外の項目は null を返す
 * (項目のパスへそのまま進む)。
 */
export function resolveNavEntryDestination(itemPath: string): string | null {
  if (itemPath === GENERATION_ENTRY_PATH) {
    return resolveGenerationEntryPath();
  }
  if (itemPath === CATALOG_ENTRY_PATH) {
    return resolveCatalogEntryPath();
  }
  return null;
}

/**
 * ナビの「生成の入口」の項目。刷新前は「コーディネート」、刷新後は「カタログ」の
 * 1つだけ(刷新後の Free Style はカタログの中の「カタログをつくる」タブ)。
 * チュートリアルの最初の一歩は、この項目に付けた目印を指す。
 */
export function getGenerationEntryItem(isCatalogRevamp: boolean): {
  path: string;
  labelKey: "catalog" | "coordinate";
  icon: LucideIcon;
} {
  return isCatalogRevamp
    ? { path: CATALOG_ENTRY_PATH, labelKey: "catalog", icon: LayoutGrid }
    : { path: GENERATION_ENTRY_PATH, labelKey: "coordinate", icon: Sparkles };
}

/**
 * ナビの項目を選択中として表示するか。
 *
 * @param itemPath 項目のパス(ロケール無し)
 * @param activePathname 今いる(または遷移中の)パス(ロケール無し)
 */
export function isNavItemActive(
  itemPath: string,
  activePathname: string
): boolean {
  if (activePathname === itemPath) {
    return true;
  }
  if (itemPath === GENERATION_ENTRY_PATH) {
    // 生成モードの入口として One-Tap Style で選択中にする(/free はこれまでどおり対象外)
    return activePathname === GENERATION_MODE_PATHS.style;
  }
  if (itemPath === CATALOG_ENTRY_PATH) {
    // User ORIGINAL、スタイルの個別ページ、生成の画面(/free・/style)もカタログの中
    return (
      activePathname === "/user-styles" ||
      activePathname.startsWith(`${CATALOG_ENTRY_PATH}/`) ||
      isGenerationModePath(activePathname)
    );
  }
  return false;
}

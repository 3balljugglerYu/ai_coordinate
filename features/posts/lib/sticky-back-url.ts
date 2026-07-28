import { ROUTES } from "@/constants";

export interface ResolveStickyBackUrlParams {
  /** 詳細URLの `?from=` の値(なければ null)。 */
  fromParam: string | null;
  /** 現在パスが /my-page/ 配下(my-page 直下は除く)か。 */
  isMyPageSubPath: boolean;
  /** ロケール付きのホームパス(最終フォールバック)。 */
  localizedHomePath: string;
}

/**
 * StickyHeader の「戻る」先を `?from=` クエリと現在パスから解決する純粋関数。
 *
 * 各生成モードの詳細→戻るの導線を維持する:
 * - `from=coordinate` → /coordinate
 * - `from=style` → /style
 * - `from=free` → /free(じゆうモードの生成→詳細→戻るでホームに飛ばさない)
 *
 * いずれにも該当しなければ my-page サブパスは /my-page、それ以外はホーム。
 */
export function resolveStickyBackUrl({
  fromParam,
  isMyPageSubPath,
  localizedHomePath,
}: ResolveStickyBackUrlParams): string {
  if (fromParam === "my-page") return ROUTES.MY_PAGE;
  if (fromParam === "notifications") return "/notifications";
  if (fromParam === "coordinate") return ROUTES.COORDINATE;
  if (fromParam === "style") return ROUTES.STYLE;
  if (fromParam === "free") return ROUTES.FREE;
  if (isMyPageSubPath) return ROUTES.MY_PAGE;
  return localizedHomePath;
}

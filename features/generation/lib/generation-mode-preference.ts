/**
 * 直近に使った生成モード(One-Tap Style / じゆうモード)を記憶するための
 * 軽量な永続化ヘルパー。
 *
 * 用途:
 *  - GenerationModeTabs が /style・/free 滞在中に現在モードを保存する
 *  - ボトムナビ/サイドバーの「コーディネート」入口が、クリック時に前回モードを
 *    読み取り、前回が One-Tap Style / じゆうモード なら該当ページへ復帰させる
 *    (カタログ刷新後の「つくる」は毎回 Free Style を開くので読まない。lib/nav-entries.ts)
 *
 * localStorage のみを使い、読み取り失敗(プライベートモード等)時は既定の
 * /style にフォールバックする(新規ユーザーの初回着地を One-Tap Style に
 * 寄せる方針)。SSR では window が無いため既定値を返す。
 *
 * 生成モード Coordinate(/coordinate)は廃止した
 * (docs/planning/coordinate-mode-deprecation-plan.md)。廃止前に保存された
 * `/coordinate` は、転送先と同じ Free Style として読む。
 */
export const GENERATION_MODE_PATHS = {
  style: "/style",
  free: "/free",
} as const;

export type GenerationModePath =
  (typeof GENERATION_MODE_PATHS)[keyof typeof GENERATION_MODE_PATHS];

/** 前回のモードを置く localStorage のキー。 */
export const LAST_GENERATION_MODE_STORAGE_KEY = "persta-ai:last-generation-mode";
const DEFAULT_PATH: GenerationModePath = GENERATION_MODE_PATHS.style;
/** 廃止した Coordinate の保存値。next.config.ts の転送と同じく Free Style へ寄せる。 */
const LEGACY_COORDINATE_PATH = "/coordinate";

/** 与えられた path が生成モードのルートかどうか。 */
export function isGenerationModePath(
  path: string | null | undefined
): path is GenerationModePath {
  return (
    path === GENERATION_MODE_PATHS.style || path === GENERATION_MODE_PATHS.free
  );
}

/** 直近に使った生成モードのパスを返す(未保存・失敗時は /style)。 */
export function getLastGenerationModePath(): GenerationModePath {
  if (typeof window === "undefined") {
    return DEFAULT_PATH;
  }
  try {
    const value = window.localStorage.getItem(LAST_GENERATION_MODE_STORAGE_KEY);
    if (value === LEGACY_COORDINATE_PATH) {
      return GENERATION_MODE_PATHS.free;
    }
    return isGenerationModePath(value) ? value : DEFAULT_PATH;
  } catch {
    return DEFAULT_PATH;
  }
}

/** 直近に使った生成モードのパスを保存する。 */
export function setLastGenerationModePath(path: GenerationModePath): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LAST_GENERATION_MODE_STORAGE_KEY, path);
  } catch {
    // localStorage に書けない環境(プライベートモード等)では黙ってスキップ
  }
}

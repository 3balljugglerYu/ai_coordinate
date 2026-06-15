/**
 * 直近に使った生成モード(コーディネート / One-Tap Style)を記憶するための
 * 軽量な永続化ヘルパー。
 *
 * 用途:
 *  - GenerationModeTabs が /coordinate・/style 滞在中に現在モードを保存する
 *  - ボトムナビ/サイドバーの「コーディネート」入口が、クリック時に前回モードを
 *    読み取り、前回が One-Tap Style なら /style へ復帰させる
 *
 * localStorage のみを使い、読み取り失敗(プライベートモード等)時は既定の
 * /coordinate にフォールバックする。SSR では window が無いため既定値を返す。
 */
export const GENERATION_MODE_PATHS = {
  coordinate: "/coordinate",
  style: "/style",
} as const;

export type GenerationModePath =
  (typeof GENERATION_MODE_PATHS)[keyof typeof GENERATION_MODE_PATHS];

const STORAGE_KEY = "persta-ai:last-generation-mode";
const DEFAULT_PATH: GenerationModePath = GENERATION_MODE_PATHS.coordinate;

/** 与えられた path が生成モードのルートかどうか。 */
export function isGenerationModePath(
  path: string | null | undefined
): path is GenerationModePath {
  return (
    path === GENERATION_MODE_PATHS.coordinate ||
    path === GENERATION_MODE_PATHS.style
  );
}

/** 直近に使った生成モードのパスを返す(未保存・失敗時は /coordinate)。 */
export function getLastGenerationModePath(): GenerationModePath {
  if (typeof window === "undefined") {
    return DEFAULT_PATH;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, path);
  } catch {
    // localStorage に書けない環境(プライベートモード等)では黙ってスキップ
  }
}

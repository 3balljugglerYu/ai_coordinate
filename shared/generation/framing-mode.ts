/**
 * framing_mode: 生成時に image_0 のポーズ・カメラアングル・構図をどこまで固定するか。
 *
 * - "locked"   : 現行挙動。ポーズ・カメラアングル・構図を厳密に維持する (デフォルト)
 * - "free_pose": キャラクターの identity (顔・髪型・体型・画風) は維持しつつ、
 *                ポーズ・カメラアングル・構図はプロンプト指定を優先する
 *
 * 本ファイルは pure (ランタイム依存ゼロ) に保ち、client / Next.js handler /
 * Deno worker のすべてから型を共有する。
 *
 * 設計: docs/planning/framing-mode-implementation-plan.md
 */

export const FRAMING_MODES = ["locked", "free_pose"] as const;
export type FramingMode = (typeof FRAMING_MODES)[number];

/**
 * framingMode が未指定 (省略) のときのフォールバック。
 * 用途は 2 つで、いずれも「保守的に現行挙動へ倒す」ためのもの:
 *  1. 既存ジョブの generation_metadata に framingMode が無い場合 (getFramingModeFromGenerationMetadata)
 *  2. リクエストが framingMode を送ってこない場合 (レガシー / 非 UI 経路)
 * UI の既定値ではない点に注意 (UI 既定は COORDINATE_DEFAULT_FRAMING_MODE)。
 */
export const DEFAULT_FRAMING_MODE: FramingMode = "locked";

/**
 * コーディネート生成 UI の既定値。コーデ画面はこの値で初期化し、ユーザーが
 * 「ポーズ・カメラをできるだけ維持」をチェックしない限り、この値を明示的に送る。
 * DEFAULT_FRAMING_MODE (= 省略時の保守的フォールバック) とは別概念で、値も異なる:
 *  - COORDINATE_DEFAULT_FRAMING_MODE = "free_pose" … UI が能動的に選ぶ既定
 *  - DEFAULT_FRAMING_MODE            = "locked"    … 省略/レガシー時の保守的既定
 * UI は常に framingMode を明示送信するため、サーバのフォールバックに依存しない。
 */
export const COORDINATE_DEFAULT_FRAMING_MODE: FramingMode = "free_pose";

/**
 * 外部入力 (formData / JSON / metadata) を FramingMode に解釈する。
 * 未知の値・非文字列は null を返す (呼び出し側で 400 にするかデフォルト適用するかを決める)。
 */
export function parseFramingMode(value: unknown): FramingMode | null {
  return value === "locked" || value === "free_pose" ? value : null;
}

/**
 * locked 以外 (= identity は維持しつつフレーム固定を解除するモード) かどうか。
 * プレフィックス・背景 suffix・リトライ強化の「free_pose 系」分岐に使う。
 */
export function isUnlockedFramingMode(
  framingMode: FramingMode | undefined,
): boolean {
  return framingMode === "free_pose";
}

/**
 * image_jobs.generation_metadata (JSONB) から framingMode を読み取る。
 * キーなし・不正値は locked (= 現行挙動) にフォールバックする。
 * worker (Deno) / Next.js の両方から使う。
 */
export function getFramingModeFromGenerationMetadata(
  metadata: unknown,
): FramingMode {
  if (typeof metadata === "object" && metadata !== null) {
    const parsed = parseFramingMode(
      (metadata as Record<string, unknown>).framingMode,
    );
    if (parsed) {
      return parsed;
    }
  }
  return DEFAULT_FRAMING_MODE;
}

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

export const DEFAULT_FRAMING_MODE: FramingMode = "locked";

/**
 * 外部入力 (formData / JSON / metadata) を FramingMode に解釈する。
 * 未知の値・非文字列は null を返す (呼び出し側で 400 にするかデフォルト適用するかを決める)。
 */
export function parseFramingMode(value: unknown): FramingMode | null {
  return value === "locked" || value === "free_pose" ? value : null;
}

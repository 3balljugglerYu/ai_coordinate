/**
 * 経過時間ベースの擬似プログレス計算。
 *
 * 同期 API（ゲストの coordinate / style 生成など、ジョブ単位の進捗が
 * クライアントから観測できないケース）で「進んでいる感」を出すために使う。
 *
 * 元は `features/style/hooks/useGenerationFeedback.ts` 内に閉じていたが、
 * /coordinate ゲストでも同じ挙動を再利用するため抽出。
 *
 * セグメント:
 *   - 0〜6s: 6% → 64%（速め、最初の手応え）
 *   - 6〜15s: 64% → 88%（中盤）
 *   - 15〜30s: 88% → 94%（鈍化）
 *   - 30s+: 94% で頭打ち（完了は呼び出し側が 100% を渡す）
 */

export const PSEUDO_INITIAL_PROGRESS = 6;
export const PSEUDO_LONG_WAIT_THRESHOLD_MS = 20000;

export function calculatePseudoProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return PSEUDO_INITIAL_PROGRESS;
  }

  if (elapsedMs < 6000) {
    const phaseProgress = elapsedMs / 6000;
    return (
      PSEUDO_INITIAL_PROGRESS +
      (64 - PSEUDO_INITIAL_PROGRESS) * (1 - (1 - phaseProgress) ** 2)
    );
  }

  if (elapsedMs < 15000) {
    const phaseProgress = (elapsedMs - 6000) / 9000;
    return 64 + (88 - 64) * (1 - (1 - phaseProgress) ** 2);
  }

  if (elapsedMs < 30000) {
    const phaseProgress = (elapsedMs - 15000) / 15000;
    return 88 + (94 - 88) * phaseProgress;
  }

  return 94;
}

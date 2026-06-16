/**
 * コレクションの「段階解放(drip)」を計算する純粋ロジック。
 *
 * 依存なし・副作用なしのユーティリティとして切り出し、serving 層(/style 配信)と
 * generate 系 route のサーバー側認可の双方から再利用する。
 *
 * 解放数の式(batch=2, total=6 の例):
 *   distinct 0 -> 2, 1 -> 2, 2 -> 4, 3 -> 4, 4 -> 6, 5 -> 6, 6 -> 6
 *   unlockedCount = min(total, batch * (1 + floor(distinctGenerated / batch)))
 *
 *   - batch が null または 0 以下 -> 段階解放なし(= total を一括解放)
 *   - distinctGenerated が total 以上でも total を超えない(クランプ)
 */

/**
 * そのカテゴリで「現在解放されているプリセット数」を返す。
 *
 * @param distinctGenerated そのカテゴリでユーザーが生成済みの distinct プリセット数
 * @param batchSize 段階解放の単位(null/0以下なら一括解放)
 * @param total カテゴリ内の総プリセット数
 * @returns 解放数([0, total] にクランプ)
 */
export function computeUnlockedCount(
  distinctGenerated: number,
  batchSize: number | null,
  total: number,
): number {
  // total が不正(0以下/非有限)なら解放数 0。
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }

  // batch が未設定/非正なら段階解放しない = 全部解放。
  if (batchSize === null || !Number.isFinite(batchSize) || batchSize <= 0) {
    return total;
  }

  // 負の生成数は 0 とみなす(防御的)。
  const safeDistinct = Number.isFinite(distinctGenerated)
    ? Math.max(0, Math.floor(distinctGenerated))
    : 0;

  const unlocked = batchSize * (1 + Math.floor(safeDistinct / batchSize));
  return Math.min(total, unlocked);
}

/**
 * sort_order 昇順で 0 始まりの index を持つプリセットが解放済みか判定する。
 *
 * @param presetIndexInSortOrder sort_order 昇順で 0 始まりの index
 */
export function isPresetUnlocked(
  presetIndexInSortOrder: number,
  distinctGenerated: number,
  batchSize: number | null,
  total: number,
): boolean {
  const unlockedCount = computeUnlockedCount(distinctGenerated, batchSize, total);
  return presetIndexInSortOrder < unlockedCount;
}

/**
 * 投稿APIの「倍率バッジ用メタを取るか」の判定。
 *
 * bonus_granted だけで判定すると、派生投稿(フリー投稿ボーナスは 0)で
 * 上乗せだけ受け取ったときに、有料プランなのにバッジが出ない。
 * 実装は route.ts に埋まっているため、判定式そのものをここで固定する。
 */
function shouldFetchBonusMeta(
  bonusGranted: number,
  promptUseBonusGranted: number
): boolean {
  return bonusGranted + promptUseBonusGranted > 0;
}

describe("倍率バッジ用メタの取得条件", () => {
  test("投稿ボーナスだけ付いたとき", () => {
    expect(shouldFetchBonusMeta(20, 0)).toBe(true);
  });

  test("上乗せだけ付いたとき（その日2回目の投稿など）", () => {
    expect(shouldFetchBonusMeta(0, 20)).toBe(true);
  });

  test("どちらも付かなかったとき", () => {
    expect(shouldFetchBonusMeta(0, 0)).toBe(false);
  });
});

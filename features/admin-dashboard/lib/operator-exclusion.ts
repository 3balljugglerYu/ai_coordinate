/**
 * 企画 KPI から運営アカウントの行を除く(ADR-002)。
 *
 * ## なぜ必要か
 *
 * 運営は公開前の確認や当日の動作確認で普通に生成する。ファッション雑誌企画では
 * 生成259件のうち14件(5.4%)・完走20件のうち1件が運営分で、除外前の数字は
 * すべて少しずつ膨らんでいた。企画同士を比べるときにこの差は効く。
 *
 * ## なぜ「取得後に落とす」のか
 *
 * PostgREST 側で `not.in.(...)` を使うと、**`user_id` が NULL のゲスト行まで
 * 一緒に落ちる**。SQL の `NULL NOT IN (...)` は TRUE ではなく NULL に評価され、
 * 行は残らない。実測でも 2026-08-01 以降の style_usage_events 2,118行のうち
 * ゲスト 326行が丸ごと消えた(1,801 → 1,475)。お試し生成やゲスト訪問は
 * 企画 KPI の主役の一つなので、これは静かに致命的になる。
 *
 * 回避策(`or(user_id.is.null,user_id.not.in.(...))`)もあるが、条件が
 * クエリごとに散らばると1本の書き忘れが数字のずれとして現れ、見つけにくい。
 * admin の取得行数はたかだか数百なので、**取得してから純関数で落とす**。
 * ここなら NULL の扱いを明示でき、テストもできる。
 *
 * 例外は完走者一覧(`get-collection-completions`)で、そちらは
 * `count: "exact"` + `range()` のサーバー側ページングを使うため取得後には落とせない。
 * `collection_completions.user_id` は NOT NULL なので、あちらは PostgREST 側で除外する。
 */

/** `user_id` を持つ行(取得元によって列が揃わないので optional で受ける)。 */
export interface OperatorFilterableRow {
  user_id?: string | null;
}

/**
 * 運営 ID の集合を作る。env と DB の2系統があり、どちらか一方だと取りこぼす。
 * 重複は除き、空文字は落とす。
 */
export function mergeOperatorUserIds(
  ...sources: Array<Iterable<string | null | undefined>>
): string[] {
  const merged = new Set<string>();
  for (const source of sources) {
    for (const id of source) {
      if (typeof id === "string" && id.length > 0) {
        merged.add(id);
      }
    }
  }
  return Array.from(merged).sort();
}

/**
 * 運営の行を落とす。**`user_id` が NULL の行は残す**(ゲストは運営ではない)。
 *
 * @param rows 取得済みの行
 * @param operatorUserIds 運営の user_id 一覧。空なら何も落とさない
 */
export function excludeOperatorRows<T extends OperatorFilterableRow>(
  rows: readonly T[] | null | undefined,
  operatorUserIds: readonly string[],
): T[] {
  const list = rows ?? [];
  if (operatorUserIds.length === 0) {
    return [...list];
  }
  const operators = new Set(operatorUserIds);
  return list.filter((row) => {
    // ゲスト行(user_id なし)は運営判定の対象外。ここを落とすと
    // お試し生成・ゲスト訪問が KPI から消える。
    if (row.user_id == null) return true;
    return !operators.has(row.user_id);
  });
}

/**
 * ID の配列から運営を除く(行ではなく ID 列を扱う経路用)。
 * NULL / 空文字はここで落とす(UU の分母に入れない)。
 */
export function excludeOperatorUserIds(
  userIds: readonly (string | null | undefined)[],
  operatorUserIds: readonly string[],
): string[] {
  const operators = new Set(operatorUserIds);
  return userIds.filter(
    (id): id is string =>
      typeof id === "string" && id.length > 0 && !operators.has(id),
  );
}

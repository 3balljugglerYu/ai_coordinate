/**
 * PostgREST の行数上限を越えて全件取るための取得ヘルパー。
 *
 * ## なぜ必要か
 *
 * PostgREST は `limit` を付けなくても既定で **1,000 行** しか返さない。
 * しかもエラーにならず 200 で返るため、`error` を見ている限り気づけない。
 * admin ダッシュボードは 2026年6月頃からこの上限を越えており、
 * 生成数・AI原価・収益・スタイル分析が黙って過小表示されていた
 * （30日の AI原価が実額の 55% しか出ていなかった）。
 *
 * 打ち切りは `created_at` 順ではなく物理順で起きるので、期間の端が欠ける
 * のではなく**全体からまだらに欠ける**。グラフの形が崩れず、割合(投稿率や
 * モデル構成比)は正しいまま実数だけが減るため、画面上に異常のサインが出ない。
 *
 * ## 数え落としではなく、はっきり失敗させる
 *
 * 上限に達したら握りつぶさずエラーを返す。**間違った数字を静かに出すより、
 * カードが赤くなる方がよい**というのがこの実装の立場。
 */

/** PostgREST の既定の最大行数（Supabase の `db.max_rows`）。 */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * 取得を打ち切る上限。現状の最大テーブルで 90日 = 約 1.3万行なので
 * 大きめに取ってある。ここに達するのは想定外であり、その場合はエラーにする。
 */
export const FETCH_ALL_MAX_PAGES = 100;

export interface PagedResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

/**
 * `id` を昇順にたどって全ページを取得する。
 *
 * オフセットではなく **`id` のカーソル**で進める。オフセットだと取得の
 * 途中に行が挿入されたときに、ずれて重複・取りこぼしが起きるため。
 *
 * @param fetchPage `cursor` より大きい `id` を、`id` 昇順で `pageSize` 件返すクエリ。
 *                  `cursor` が null なら先頭から。
 */
export async function fetchAllRows<Row extends { id: string }>(
  fetchPage: (
    cursor: string | null,
    pageSize: number
  ) => PromiseLike<PagedResult<Row>>,
  pageSize: number = POSTGREST_MAX_ROWS
): Promise<PagedResult<Row>> {
  const all: Row[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < FETCH_ALL_MAX_PAGES; page += 1) {
    const { data, error } = await fetchPage(cursor, pageSize);

    if (error) {
      return { data: null, error };
    }

    const rows = data ?? [];
    all.push(...rows);

    // 満たない = 最後のページ。ちょうど pageSize のときは次を確認する
    if (rows.length < pageSize) {
      return { data: all, error: null };
    }

    cursor = rows[rows.length - 1].id;
  }

  return {
    data: null,
    error: {
      message:
        `fetchAllRows: ${FETCH_ALL_MAX_PAGES} ページ(${FETCH_ALL_MAX_PAGES * pageSize}件)を超えました。` +
        "取得件数が想定を大きく越えているため、集計を SQL 側へ寄せる検討が必要です。",
    },
  };
}

/**
 * `id` カーソルの決まり文句をまとめたもの。
 *
 * 呼び出し側は「どのテーブルから何を取るか」だけ書けばよく、
 * `gt(id, cursor)` / `order(id)` / `limit()` の付け忘れを防げる。
 * select に `id` を含めること（カーソルに使う）。
 */
export function fetchAllById<Row extends { id: string }>(
  buildQuery: () => CursorQuery<Row>,
  pageSize: number = POSTGREST_MAX_ROWS
): Promise<PagedResult<Row>> {
  return fetchAllRows<Row>((cursor, size) => {
    let query = buildQuery();
    if (cursor) {
      query = query.gt("id", cursor);
    }
    return query.order("id", { ascending: true }).limit(size);
  }, pageSize);
}

/** supabase-js のクエリビルダのうち、ページングに必要な部分だけ。 */
export interface CursorQuery<Row> {
  gt(column: string, value: string): CursorQuery<Row>;
  order(
    column: string,
    options: { ascending: boolean }
  ): { limit(count: number): PromiseLike<PagedResult<Row>> };
}

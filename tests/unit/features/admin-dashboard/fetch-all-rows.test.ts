/** @jest-environment node */

/**
 * PostgREST の 1,000 行上限を越えて全件取れているか。
 *
 * ここが1ページで止まると、admin の生成数・AI原価・収益が黙って過小になる。
 * エラーも欠けたグラフも出ず、割合(投稿率など)は正しいまま実数だけが減るため、
 * 画面を見ても気づけない。だから「取れているか」をテストで固定する。
 */

import {
  fetchAllRows,
  FETCH_ALL_MAX_PAGES,
  POSTGREST_MAX_ROWS,
} from "@/features/admin-dashboard/lib/fetch-all-rows";

type Row = { id: string; n: number };

/** id 昇順に並んだ疑似テーブルから、カーソル以降を返す。 */
function makeTable(size: number) {
  const rows: Row[] = Array.from({ length: size }, (_, i) => ({
    // 桁を揃えないと文字列比較で並び順が壊れる
    id: String(i).padStart(6, "0"),
    n: i,
  }));

  const calls: Array<string | null> = [];

  const fetchPage = (cursor: string | null, pageSize: number) => {
    calls.push(cursor);
    const start = cursor
      ? rows.findIndex((row) => row.id > cursor)
      : 0;
    const slice =
      start === -1 ? [] : rows.slice(start, start + pageSize);
    return Promise.resolve({ data: slice, error: null });
  };

  return { rows, calls, fetchPage };
}

describe("fetchAllRows", () => {
  test("1ページに収まる場合はそのまま返す", async () => {
    const table = makeTable(10);

    const result = await fetchAllRows<Row>(table.fetchPage, 100);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(10);
    expect(table.calls).toEqual([null]);
  });

  test("上限を越える件数でも全件返す（打ち切らない）", async () => {
    const table = makeTable(2546);

    const result = await fetchAllRows<Row>(table.fetchPage, POSTGREST_MAX_ROWS);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2546);
    // id の重複・取りこぼしが無いこと
    expect(new Set(result.data?.map((row) => row.id)).size).toBe(2546);
    expect(result.data?.[2545]?.n).toBe(2545);
  });

  test("ページ境界ちょうどでも1件も落とさない", async () => {
    const table = makeTable(200);

    const result = await fetchAllRows<Row>(table.fetchPage, 100);

    expect(result.data).toHaveLength(200);
    // 2ページ目が満杯なので、空を確認する3回目が必要
    expect(table.calls).toHaveLength(3);
  });

  test("カーソルは直前のページの最後の id で進む", async () => {
    const table = makeTable(250);

    await fetchAllRows<Row>(table.fetchPage, 100);

    expect(table.calls).toEqual([null, "000099", "000199"]);
  });

  test("途中でエラーが出たら部分結果を返さない", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({
          id: String(i).padStart(6, "0"),
          n: i,
        })),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const result = await fetchAllRows<Row>(fetchPage, 100);

    // 中途半端な件数を返すと、それが正しい数字として集計されてしまう
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("boom");
  });

  test("想定を越え続ける場合は黙って切らずエラーにする", async () => {
    const full = Array.from({ length: 10 }, (_, i) => ({
      id: String(i).padStart(6, "0"),
      n: i,
    }));
    // 常に満杯を返し続ける = 終わらないページング
    const fetchPage = jest.fn().mockResolvedValue({ data: full, error: null });

    const result = await fetchAllRows<Row>(fetchPage, 10);

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("集計を SQL 側へ寄せる");
    expect(fetchPage).toHaveBeenCalledTimes(FETCH_ALL_MAX_PAGES);
  });
});

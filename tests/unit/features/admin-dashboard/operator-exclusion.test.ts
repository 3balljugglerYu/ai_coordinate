/**
 * 企画 KPI からの運営除外。
 *
 * ここが誤ると、admin の数字が静かにずれる。落ちないので気づけない。
 * 特に **ゲスト行(user_id が NULL)を巻き込んで落とす**のが危険で、
 * PostgREST の `not.in` を素直に使うとそうなる(SQL の `NULL NOT IN (...)` は
 * TRUE ではなく NULL に評価されるため)。本番の style_usage_events で実測したところ、
 * 2026-08-01 以降の 2,118 行のうちゲスト 326 行が丸ごと消えていた。
 * お試し生成・ゲスト訪問は企画 KPI の主役の一つなので、これは致命的になる。
 */

import {
  excludeOperatorRows,
  excludeOperatorUserIds,
  mergeOperatorUserIds,
} from "@/features/admin-dashboard/lib/operator-exclusion";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const PREVIEW = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

describe("mergeOperatorUserIds", () => {
  test("複数系統をまとめ、重複を除く", () => {
    expect(
      mergeOperatorUserIds([ADMIN, PREVIEW], [PREVIEW], [ADMIN]),
    ).toEqual([ADMIN, PREVIEW].sort());
  });

  test("null・undefined・空文字は落とす", () => {
    expect(mergeOperatorUserIds([ADMIN, null, undefined, ""])).toEqual([ADMIN]);
  });

  test("入力が空なら空", () => {
    expect(mergeOperatorUserIds([], [])).toEqual([]);
  });
});

describe("excludeOperatorRows", () => {
  const rows = [
    { user_id: ADMIN, event_type: "generate" },
    { user_id: USER, event_type: "generate" },
    { user_id: null, event_type: "generate" },
  ];

  test("運営の行を落とす", () => {
    const result = excludeOperatorRows(rows, [ADMIN]);

    expect(result.map((r) => r.user_id)).toEqual([USER, null]);
  });

  /*
    この1件が本命。`not.in` を使うと NULL 行まで落ちる。
    ゲストは運営ではないので必ず残す。
  */
  test("⭐ゲスト行(user_id が NULL)は残す", () => {
    const result = excludeOperatorRows(rows, [ADMIN, PREVIEW, USER]);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBeNull();
  });

  test("user_id そのものが無い行も残す(列を取っていない経路の保険)", () => {
    const result = excludeOperatorRows(
      [{ event_type: "visit" }] as { user_id?: string | null }[],
      [ADMIN],
    );

    expect(result).toHaveLength(1);
  });

  test("運営が0名なら何も落とさない", () => {
    expect(excludeOperatorRows(rows, [])).toHaveLength(3);
  });

  test("null・undefined を渡しても落ちない", () => {
    expect(excludeOperatorRows(null, [ADMIN])).toEqual([]);
    expect(excludeOperatorRows(undefined, [ADMIN])).toEqual([]);
  });

  test("元の配列を破壊しない", () => {
    const original = [...rows];
    excludeOperatorRows(rows, [ADMIN]);

    expect(rows).toEqual(original);
  });
});

describe("excludeOperatorUserIds", () => {
  test("運営を除いた ID だけを返す", () => {
    expect(excludeOperatorUserIds([ADMIN, USER, USER], [ADMIN])).toEqual([
      USER,
      USER,
    ]);
  });

  /*
    こちらは UU の分母になる ID 列なので、NULL は落とす(行の除外とは扱いが逆)。
    ゲストは user_id を持たず viewer_key で数えるため、ここに NULL が混ざると
    「誰でもない1人」を数えてしまう。
  */
  test("⭐NULL・空文字はここでは落とす(UU の分母に入れない)", () => {
    expect(excludeOperatorUserIds([null, undefined, "", USER], [])).toEqual([
      USER,
    ]);
  });

  test("運営が0名でも NULL は落ちる", () => {
    expect(excludeOperatorUserIds([null, ADMIN], [])).toEqual([ADMIN]);
  });
});

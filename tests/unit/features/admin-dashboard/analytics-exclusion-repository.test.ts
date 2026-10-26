/** @jest-environment node */

/**
 * 集計から除く一覧の読み書き。
 *
 * - 同じ人を2回足すと DB の主キーで断られる(23505)。それを「すでに入っています」に変え、
 *   API が 409 を返せるようにする(500 にしない)
 * - 外すとき、消した行が無ければ false(API は 404)
 * - 集計用の ID の読み込みは、失敗を握りつぶさない(strict の呼び出し元が気づけるように)
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AnalyticsExclusionExistsError,
  addAnalyticsExclusion,
  listAnalyticsExcludedUserIds,
  listAnalyticsExclusions,
  profileExistsForExclusion,
  removeAnalyticsExclusion,
} from "@/features/admin-dashboard/lib/analytics-exclusion-repository";

const USER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";

function client(handlers: Record<string, unknown>): SupabaseClient {
  return {
    from: jest.fn((table: string) => {
      const handler = handlers[table];
      if (!handler) throw new Error(`unexpected table ${table}`);
      return handler;
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * fetchAllRows が呼ぶ形(select → gt? → order → limit)のスタブ。
 * pages の順に返し、受け取ったカーソルを記録する。
 */
function pagedTable(pages: Array<{ data: unknown; error: unknown }>) {
  const cursors: Array<string | null> = [];
  const selects: string[] = [];
  let call = 0;
  const table = {
    select: jest.fn((columns: string) => {
      selects.push(columns);
      let cursor: string | null = null;
      const query = {
        gt: jest.fn((_col: string, value: string) => {
          cursor = value;
          return query;
        }),
        order: jest.fn(() => query),
        limit: jest.fn(() => {
          cursors.push(cursor);
          const page = pages[call] ?? { data: [], error: null };
          call += 1;
          return Promise.resolve(page);
        }),
      };
      return query;
    }),
  };
  return { table, cursors, selects };
}

describe("addAnalyticsExclusion", () => {
  test("足す人・理由・足した管理者を入れる", async () => {
    const insert = jest.fn(() => Promise.resolve({ error: null }));
    await addAnalyticsExclusion(
      { userId: USER, reason: "審査用", addedBy: ADMIN },
      client({ analytics_excluded_users: { insert } }),
    );
    expect(insert).toHaveBeenCalledWith({ user_id: USER, reason: "審査用", added_by: ADMIN });
  });

  test("主キーの重複(23505)は AnalyticsExclusionExistsError にする", async () => {
    const insert = jest.fn(() =>
      Promise.resolve({ error: { code: "23505", message: "duplicate key" } }),
    );
    await expect(
      addAnalyticsExclusion(
        { userId: USER, reason: "審査用", addedBy: ADMIN },
        client({ analytics_excluded_users: { insert } }),
      ),
    ).rejects.toBeInstanceOf(AnalyticsExclusionExistsError);
  });

  test("ほかのエラーはふつうの失敗にする", async () => {
    const insert = jest.fn(() =>
      Promise.resolve({ error: { code: "23514", message: "check" } }),
    );
    const promise = addAnalyticsExclusion(
      { userId: USER, reason: "審査用", addedBy: ADMIN },
      client({ analytics_excluded_users: { insert } }),
    );
    await expect(promise).rejects.toThrow("集計から除く一覧への追加に失敗しました");
    await expect(promise).rejects.not.toBeInstanceOf(AnalyticsExclusionExistsError);
  });
});

describe("removeAnalyticsExclusion", () => {
  function deleteClient(result: { data: unknown; error: unknown }) {
    const select = jest.fn(() => Promise.resolve(result));
    const eq = jest.fn(() => ({ select }));
    return { c: client({ analytics_excluded_users: { delete: () => ({ eq }) } }), eq };
  }

  test("消した行があれば true", async () => {
    const { c, eq } = deleteClient({ data: [{ user_id: USER }], error: null });
    await expect(removeAnalyticsExclusion(USER, c)).resolves.toBe(true);
    expect(eq).toHaveBeenCalledWith("user_id", USER);
  });

  test("消した行が無ければ false", async () => {
    const { c } = deleteClient({ data: [], error: null });
    await expect(removeAnalyticsExclusion(USER, c)).resolves.toBe(false);
  });
});

describe("listAnalyticsExcludedUserIds", () => {
  test("user_id を id の別名で取り、空は落とす", async () => {
    const { table, selects } = pagedTable([
      { data: [{ id: USER }, { id: "" }], error: null },
    ]);
    await expect(
      listAnalyticsExcludedUserIds(client({ analytics_excluded_users: table })),
    ).resolves.toEqual([USER]);
    expect(selects[0]).toContain("id:user_id");
  });

  test("1,000行を超えても、user_id のカーソルで最後まで読む(黙って欠けない)", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const { table, cursors } = pagedTable([
      { data: firstPage, error: null },
      { data: [{ id: USER }], error: null },
    ]);
    const ids = await listAnalyticsExcludedUserIds(
      client({ analytics_excluded_users: table }),
    );
    expect(ids).toHaveLength(1001);
    expect(ids).toContain(USER);
    expect(cursors).toEqual([null, firstPage[999].id]);
  });

  test("読めなければ throw する(握りつぶさない)", async () => {
    const { table } = pagedTable([{ data: null, error: { message: "denied" } }]);
    await expect(
      listAnalyticsExcludedUserIds(client({ analytics_excluded_users: table })),
    ).rejects.toThrow("analytics_excluded_users の取得に失敗しました: denied");
  });
});

describe("profileExistsForExclusion", () => {
  function profileClient(result: { data: unknown; error: unknown }) {
    const maybeSingle = jest.fn(() => Promise.resolve(result));
    return client({ profiles: { select: () => ({ eq: () => ({ maybeSingle }) }) } });
  }

  test("いれば true・いなければ false", async () => {
    await expect(
      profileExistsForExclusion(USER, profileClient({ data: { user_id: USER }, error: null })),
    ).resolves.toBe(true);
    await expect(
      profileExistsForExclusion(USER, profileClient({ data: null, error: null })),
    ).resolves.toBe(false);
  });

  test("読めなければ false にせず throw する(障害を「いない」と見せない)", async () => {
    await expect(
      profileExistsForExclusion(USER, profileClient({ data: null, error: { message: "timeout" } })),
    ).rejects.toThrow("profiles の取得に失敗しました: timeout");
  });
});

describe("listAnalyticsExclusions", () => {
  test("本人と足した管理者のニックネームを付け、新しい順に並べる", async () => {
    const OLDER = "33333333-3333-4333-8333-333333333333";
    const { table } = pagedTable([
      {
        data: [
          { id: USER, reason: "審査用", added_by: ADMIN, created_at: "2026-10-26T00:00:00Z" },
          { id: OLDER, reason: "別名", added_by: null, created_at: "2026-10-01T00:00:00Z" },
        ],
        error: null,
      },
    ]);
    const inFn = jest.fn(() =>
      Promise.resolve({
        data: [
          { user_id: USER, nickname: "あかね" },
          { user_id: ADMIN, nickname: "運営" },
        ],
        error: null,
      }),
    );
    const c = client({
      analytics_excluded_users: table,
      profiles: { select: () => ({ in: inFn }) },
    });
    await expect(listAnalyticsExclusions(c)).resolves.toEqual([
      {
        userId: USER,
        nickname: "あかね",
        reason: "審査用",
        addedBy: ADMIN,
        addedByNickname: "運営",
        createdAt: "2026-10-26T00:00:00Z",
      },
      {
        userId: OLDER,
        nickname: null,
        reason: "別名",
        addedBy: null,
        addedByNickname: null,
        createdAt: "2026-10-01T00:00:00Z",
      },
    ]);
    expect(inFn).toHaveBeenCalledWith("user_id", [USER, ADMIN, OLDER]);
  });

  test("空なら profiles を引かない", async () => {
    const { table } = pagedTable([{ data: [], error: null }]);
    const profiles = { select: jest.fn() };
    const c = client({
      analytics_excluded_users: table,
      profiles,
    });
    await expect(listAnalyticsExclusions(c)).resolves.toEqual([]);
    expect(profiles.select).not.toHaveBeenCalled();
  });

  test("ニックネームは200人ずつに分けて引く(URL の長さと行数の上限に当たらないように)", async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      reason: "別名",
      added_by: null,
      created_at: "2026-10-26T00:00:00Z",
    }));
    const { table } = pagedTable([{ data: rows, error: null }]);
    const inFn = jest.fn((_col: string, ids: string[]) =>
      Promise.resolve({ data: ids.map((id) => ({ user_id: id, nickname: `n-${id.slice(-3)}` })), error: null }),
    );
    const c = client({
      analytics_excluded_users: table,
      profiles: { select: () => ({ in: inFn }) },
    });
    const list = await listAnalyticsExclusions(c);
    expect(inFn.mock.calls.map((call) => call[1].length)).toEqual([200, 200, 50]);
    expect(list).toHaveLength(450);
    expect(list.every((e) => e.nickname !== null)).toBe(true);
  });
});


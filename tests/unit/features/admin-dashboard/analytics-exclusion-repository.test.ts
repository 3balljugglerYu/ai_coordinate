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
  test("user_id だけを返し、空や null は落とす", async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ user_id: USER }, { user_id: null }, { user_id: "" }], error: null }),
    );
    await expect(
      listAnalyticsExcludedUserIds(client({ analytics_excluded_users: { select } })),
    ).resolves.toEqual([USER]);
  });

  test("読めなければ throw する(握りつぶさない)", async () => {
    const select = jest.fn(() => Promise.resolve({ data: null, error: { message: "denied" } }));
    await expect(
      listAnalyticsExcludedUserIds(client({ analytics_excluded_users: { select } })),
    ).rejects.toThrow("analytics_excluded_users の取得に失敗しました: denied");
  });
});

describe("listAnalyticsExclusions", () => {
  test("本人と足した管理者のニックネームを付ける", async () => {
    const order = jest.fn(() =>
      Promise.resolve({
        data: [
          { user_id: USER, reason: "審査用", added_by: ADMIN, created_at: "2026-10-26T00:00:00Z" },
        ],
        error: null,
      }),
    );
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
      analytics_excluded_users: { select: () => ({ order }) },
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
    ]);
    expect(inFn).toHaveBeenCalledWith("user_id", [USER, ADMIN]);
  });

  test("空なら profiles を引かない", async () => {
    const order = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const profiles = { select: jest.fn() };
    const c = client({
      analytics_excluded_users: { select: () => ({ order }) },
      profiles,
    });
    await expect(listAnalyticsExclusions(c)).resolves.toEqual([]);
    expect(profiles.select).not.toHaveBeenCalled();
  });
});

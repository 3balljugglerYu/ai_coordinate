/** @jest-environment node */

/**
 * 見本を使える人の一覧の読み書き(i2i-allowlist-repository)。
 *
 * ここで守ること:
 *  - 足すのは何度呼んでも同じ。新しい人は足した人(added_by)とメモ付きで足す
 *  - すでにいる人(UNIQUE にぶつかる)は有効に戻すだけ。足した人は書き換えず、メモは指定したときだけ上書き
 *  - 切り替え・削除は、一覧にいなければ false
 *  - 実在の確認で DB が失敗したら投げる(見つからない、と取り違えない)
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addI2iAllowlistMember,
  profileExistsForI2iAllowlist,
  removeI2iAllowlistMember,
  setI2iAllowlistActive,
} from "@/features/catalog-references/lib/i2i-allowlist-repository";

type Result = { data?: unknown; error: { code?: string; message: string } | null };
type Op = "insert" | "update" | "delete" | "select";

/** 呼ばれた操作を記録し、操作ごとに決めた結果を返すクライアント */
function client(results: Partial<Record<Op, Result>>) {
  const calls: Array<[string, unknown[]]> = [];
  let op: Op = "select";
  const chain: Record<string, unknown> = {};
  for (const method of ["insert", "update", "delete", "select", "eq", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      if (method === "insert" || method === "update" || method === "delete") op = method;
      return chain;
    };
  }
  chain.then = (resolve: (value: Result) => unknown) => resolve(results[op] ?? { data: [], error: null });
  const supabase = { from: jest.fn(() => chain) } as unknown as SupabaseClient;
  return { supabase, calls };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("addI2iAllowlistMember", () => {
  test("新しい人は、足した人とメモ付きで足す", async () => {
    const { supabase, calls } = client({ insert: { error: null } });

    await expect(addI2iAllowlistMember({ userId: "u1", note: "選抜", addedBy: "admin" }, supabase)).resolves.toEqual({
      reactivated: false,
    });
    expect(calls).toContainEqual(["insert", [{ user_id: "u1", is_active: true, note: "選抜", added_by: "admin" }]]);
    expect(calls.some(([method]) => method === "update")).toBe(false);
  });

  test("すでにいる人は有効に戻すだけで、足した人は書き換えない(メモを指定しなければメモも残す)", async () => {
    const { supabase, calls } = client({
      insert: { error: { code: "23505", message: "duplicate key" } },
      update: { error: null },
    });

    await expect(addI2iAllowlistMember({ userId: "u1", addedBy: "admin2" }, supabase)).resolves.toEqual({
      reactivated: true,
    });
    expect(calls).toContainEqual(["update", [{ is_active: true }]]);
  });

  test("有効に戻すとき、メモを指定したら上書きする", async () => {
    const { supabase, calls } = client({
      insert: { error: { code: "23505", message: "duplicate key" } },
      update: { error: null },
    });

    await addI2iAllowlistMember({ userId: "u1", note: "再開" }, supabase);

    expect(calls).toContainEqual(["update", [{ is_active: true, note: "再開" }]]);
  });

  test("UNIQUE 以外のエラーは投げる", async () => {
    const { supabase } = client({ insert: { error: { code: "XX000", message: "boom" } } });

    await expect(addI2iAllowlistMember({ userId: "u1" }, supabase)).rejects.toThrow("見本を使える人の追加に失敗しました");
  });
});

describe("切り替え・削除", () => {
  test.each([
    ["切り替え", (s: SupabaseClient) => setI2iAllowlistActive("u1", false, s), "update"],
    ["削除", (s: SupabaseClient) => removeI2iAllowlistMember("u1", s), "delete"],
  ] as const)("%s: 一覧にいれば true、いなければ false", async (_label, call, op) => {
    expect(await call(client({ [op]: { data: [{ user_id: "u1" }], error: null } }).supabase)).toBe(true);
    expect(await call(client({ [op]: { data: [], error: null } }).supabase)).toBe(false);
  });
});

describe("profileExistsForI2iAllowlist", () => {
  test("行があれば true・無ければ false・DB のエラーは投げる", async () => {
    await expect(
      profileExistsForI2iAllowlist("u1", client({ select: { data: { user_id: "u1" }, error: null } }).supabase),
    ).resolves.toBe(true);
    await expect(
      profileExistsForI2iAllowlist("u1", client({ select: { data: null, error: null } }).supabase),
    ).resolves.toBe(false);
    await expect(
      profileExistsForI2iAllowlist("u1", client({ select: { data: null, error: { message: "timeout" } } }).supabase),
    ).rejects.toThrow("利用者の確認に失敗しました");
  });
});

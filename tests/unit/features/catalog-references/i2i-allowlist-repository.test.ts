/** @jest-environment node */

/**
 * 見本を使える人の一覧の読み書き(i2i-allowlist-repository)。
 *
 * ここで守ること:
 *  - 足すのは何度呼んでも同じ。user_id がぶつかったら何もしない足し方で、足せた件数で新しく足したかを決める
 *  - 新しい人は足した人(added_by)とメモ付きで足す
 *  - もう一覧にいた人は、その人だけを有効に戻す。足した人は書き換えず、メモは指定したときだけ上書き。
 *    戻す前に消されていた(0件)なら失敗にする
 *  - 切り替え・削除は、その人だけを対象にし、書いた件数で一覧にいたかを返す
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
type Op = "upsert" | "update" | "delete" | "select";

/**
 * 呼ばれた操作を記録し、操作ごとに決めた結果を返すクライアント。
 * 書き込み(upsert・update・delete)は、本物と同じく .select() を呼んだときだけ行を返す。
 */
function client(results: Partial<Record<Op, Result>>) {
  const calls: Array<[string, unknown[]]> = [];
  let op: Op = "select";
  let selected = false;
  const chain: Record<string, unknown> = {};
  for (const method of ["upsert", "update", "delete", "select", "eq", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      if (method === "upsert" || method === "update" || method === "delete") {
        op = method;
        selected = false;
      }
      if (method === "select") selected = true;
      return chain;
    };
  }
  chain.then = (resolve: (value: Result) => unknown) => {
    const result = results[op] ?? { data: [], error: null };
    return resolve(op !== "select" && !selected ? { ...result, data: null } : result);
  };
  const supabase = { from: jest.fn(() => chain) } as unknown as SupabaseClient;
  return { supabase, calls };
}

const methods = (calls: Array<[string, unknown[]]>) => calls.map(([method]) => method);

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("addI2iAllowlistMember", () => {
  test("新しい人は、足した人とメモ付きで、ぶつかったら何もしない足し方で足す", async () => {
    const { supabase, calls } = client({ upsert: { data: [{ user_id: "u1" }], error: null } });

    await expect(addI2iAllowlistMember({ userId: "u1", note: "選抜", addedBy: "admin" }, supabase)).resolves.toEqual({
      created: true,
    });
    expect(calls).toContainEqual([
      "upsert",
      [
        { user_id: "u1", is_active: true, note: "選抜", added_by: "admin" },
        { onConflict: "user_id", ignoreDuplicates: true },
      ],
    ]);
    expect(methods(calls)).not.toContain("update");
  });

  test("もう一覧にいた人は、その人だけを有効に戻す。足した人は書き換えず、メモを指定しなければメモも残す", async () => {
    const { supabase, calls } = client({
      upsert: { data: [], error: null },
      update: { data: [{ user_id: "u1" }], error: null },
    });

    await expect(addI2iAllowlistMember({ userId: "u1", addedBy: "admin2" }, supabase)).resolves.toEqual({
      created: false,
    });
    expect(calls).toContainEqual(["update", [{ is_active: true }]]);
    expect(calls).toContainEqual(["eq", ["user_id", "u1"]]);
  });

  test("有効に戻すとき、メモを指定したら上書きする", async () => {
    const { supabase, calls } = client({
      upsert: { data: [], error: null },
      update: { data: [{ user_id: "u1" }], error: null },
    });

    await addI2iAllowlistMember({ userId: "u1", note: "再開" }, supabase);

    expect(calls).toContainEqual(["update", [{ is_active: true, note: "再開" }]]);
  });

  test("有効に戻す前に消されていた(0件)なら、足したことにせず投げる", async () => {
    const { supabase } = client({ upsert: { data: [], error: null }, update: { data: [], error: null } });

    await expect(addI2iAllowlistMember({ userId: "u1" }, supabase)).rejects.toThrow("見本を使える人の追加に失敗しました");
  });

  test("有効に戻す書き込みが失敗したら投げる", async () => {
    const { supabase } = client({
      upsert: { data: [], error: null },
      update: { data: null, error: { message: "timeout" } },
    });

    await expect(addI2iAllowlistMember({ userId: "u1" }, supabase)).rejects.toThrow("見本を使える人の追加に失敗しました");
  });

  test("足すのが失敗したら、有効に戻す書き込みはせずに投げる", async () => {
    const { supabase, calls } = client({ upsert: { data: null, error: { code: "23503", message: "fk" } } });

    await expect(addI2iAllowlistMember({ userId: "u1" }, supabase)).rejects.toThrow("見本を使える人の追加に失敗しました");
    expect(methods(calls)).not.toContain("update");
  });
});

describe("切り替え・削除", () => {
  test.each([
    ["切り替え", (s: SupabaseClient) => setI2iAllowlistActive("u1", false, s), "update"],
    ["削除", (s: SupabaseClient) => removeI2iAllowlistMember("u1", s), "delete"],
  ] as const)("%s: その人だけを対象にし、一覧にいれば true、いなければ false", async (_label, call, op) => {
    const found = client({ [op]: { data: [{ user_id: "u1" }], error: null } });
    expect(await call(found.supabase)).toBe(true);
    expect(found.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(methods(found.calls)).toContain("select");

    expect(await call(client({ [op]: { data: [], error: null } }).supabase)).toBe(false);
  });

  test("切り替えで書き込みが失敗したら投げる", async () => {
    await expect(
      setI2iAllowlistActive("u1", true, client({ update: { data: null, error: { message: "timeout" } } }).supabase),
    ).rejects.toThrow("見本を使える人の更新に失敗しました");
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

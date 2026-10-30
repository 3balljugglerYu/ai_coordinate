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
  listI2iAllowlist,
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

describe("listI2iAllowlist", () => {
  /** 表ごとに結果を返すクライアント(一覧と profiles) */
  function listClient(allowlist: Result, profiles: Result) {
    const calls: Array<[string, string, unknown[]]> = [];
    const supabase = {
      from: jest.fn((table: string) => {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "order", "in"]) {
          chain[method] = (...args: unknown[]) => {
            calls.push([table, method, args]);
            return chain;
          };
        }
        chain.then = (resolve: (value: Result) => unknown) =>
          resolve(table === "i2i_catalog_allowlist" ? allowlist : profiles);
        return chain;
      }),
    } as unknown as SupabaseClient;
    return { supabase, calls };
  }

  test("足した順の新しい順で読み、その人たちの名前とアイコンを合わせる(プロフィールが無い人は空)", async () => {
    const { supabase, calls } = listClient(
      {
        data: [
          { user_id: "u2", is_active: false, note: "一時停止", created_at: "2026-10-30T02:00:00Z" },
          { user_id: "u1", is_active: true, note: null, created_at: "2026-10-29T02:00:00Z" },
        ],
        error: null,
      },
      { data: [{ user_id: "u1", nickname: "はな", avatar_url: "https://example.test/a.webp" }], error: null },
    );

    await expect(listI2iAllowlist(supabase)).resolves.toEqual([
      { userId: "u2", nickname: null, avatarUrl: null, isActive: false, note: "一時停止", addedAt: "2026-10-30T02:00:00Z" },
      {
        userId: "u1",
        nickname: "はな",
        avatarUrl: "https://example.test/a.webp",
        isActive: true,
        note: null,
        addedAt: "2026-10-29T02:00:00Z",
      },
    ]);
    expect(calls).toContainEqual(["i2i_catalog_allowlist", "order", ["created_at", { ascending: false }]]);
    expect(calls).toContainEqual(["profiles", "in", ["user_id", ["u2", "u1"]]]);
  });

  test("だれもいなければ、プロフィールを読まずに空を返す", async () => {
    const { supabase, calls } = listClient({ data: [], error: null }, { data: [], error: null });

    await expect(listI2iAllowlist(supabase)).resolves.toEqual([]);
    expect(calls.some(([table]) => table === "profiles")).toBe(false);
  });

  test.each([
    ["一覧", { data: null, error: { message: "timeout" } }, { data: [], error: null }],
    ["プロフィール", { data: [{ user_id: "u1", is_active: true, note: null, created_at: "x" }], error: null }, { data: null, error: { message: "timeout" } }],
  ])("%sが読めなければ投げる", async (_label, allowlist, profiles) => {
    await expect(listI2iAllowlist(listClient(allowlist, profiles).supabase)).rejects.toThrow(
      "見本を使える人の一覧の取得に失敗しました",
    );
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

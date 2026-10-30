/** @jest-environment node */

/**
 * 見本(参照画像)の保存と、生成の受付での確かめ(reference-image-repository)。
 *
 * ここで守ること(計画書 ADR-002):
 *  - 非公開のバケット catalog-references の {本人の ID}/{uuid}.webp に置き、上書きしない
 *  - 行には本人・置き場所・同意の時刻を入れ、id を返す
 *  - 行を作れなかったら、置いたファイルを消して投げる
 *  - 受付の確かめは、本人の見本で、作り直しになっていないものだけ true。DB のエラーは投げる
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isUsableOwnCatalogReference,
  saveCatalogReferenceImage,
} from "@/features/catalog-references/lib/reference-image-repository";

function client(options: {
  upload?: { error: { message: string } | null };
  insert?: { data: unknown; error: { message: string } | null };
  select?: { data: unknown; error: { message: string } | null };
}) {
  const storageCalls: Array<[string, unknown[]]> = [];
  const dbCalls: Array<[string, unknown[]]> = [];
  const bucket = {
    upload: jest.fn(async (...args: unknown[]) => {
      storageCalls.push(["upload", args]);
      return options.upload ?? { error: null };
    }),
    remove: jest.fn(async (...args: unknown[]) => {
      storageCalls.push(["remove", args]);
      return { error: null };
    }),
  };
  let op = "select";
  const chain: Record<string, unknown> = {};
  for (const method of ["insert", "select", "eq", "is", "single", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      dbCalls.push([method, args]);
      if (method === "insert") op = "insert";
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(op === "insert" ? options.insert ?? { data: { id: "ref-1" }, error: null } : options.select);
  const supabase = {
    storage: { from: jest.fn((name: string) => (storageCalls.push(["from", [name]]), bucket)) },
    from: jest.fn(() => chain),
  } as unknown as SupabaseClient;
  return { supabase, storageCalls, dbCalls };
}

const USER = "11111111-1111-4111-8111-111111111111";

describe("saveCatalogReferenceImage", () => {
  test("非公開のバケットの本人のフォルダに WebP で置き、同意の時刻つきの行を作って id を返す", async () => {
    const { supabase, storageCalls, dbCalls } = client({});
    const consentedAt = new Date("2026-10-30T10:00:00Z");

    await expect(
      saveCatalogReferenceImage({ userId: USER, webpBuffer: Buffer.from("w"), consentedAt }, supabase),
    ).resolves.toEqual({ id: "ref-1" });

    expect(storageCalls[0]).toEqual(["from", ["catalog-references"]]);
    const [path, , options] = storageCalls[1][1] as [string, unknown, unknown];
    expect(path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.webp$`));
    expect(options).toEqual({ contentType: "image/webp", upsert: false });
    expect(dbCalls).toContainEqual([
      "insert",
      [{ user_id: USER, storage_path: path, copyright_consent_at: "2026-10-30T10:00:00.000Z" }],
    ]);
  });

  test("置けなかったら投げ、行は作らない", async () => {
    const { supabase, dbCalls } = client({ upload: { error: { message: "denied" } } });
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      saveCatalogReferenceImage({ userId: USER, webpBuffer: Buffer.from("w"), consentedAt: new Date() }, supabase),
    ).rejects.toThrow("見本の保存に失敗しました");
    expect(dbCalls.some(([method]) => method === "insert")).toBe(false);
  });

  test("行を作れなかったら、置いたファイルを消して投げる", async () => {
    const { supabase, storageCalls } = client({ insert: { data: null, error: { message: "fk" } } });
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      saveCatalogReferenceImage({ userId: USER, webpBuffer: Buffer.from("w"), consentedAt: new Date() }, supabase),
    ).rejects.toThrow("見本の保存に失敗しました");
    const uploadedPath = (storageCalls.find(([m]) => m === "upload")?.[1] as [string])[0];
    expect(storageCalls).toContainEqual(["remove", [[uploadedPath]]]);
  });

  test("消すのにも失敗したら、残ったファイルを記録する", async () => {
    const { supabase } = client({ insert: { data: null, error: { message: "fk" } } });
    (supabase.storage.from("catalog-references").remove as jest.Mock).mockResolvedValueOnce({ error: { message: "gone" } });
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      saveCatalogReferenceImage({ userId: USER, webpBuffer: Buffer.from("w"), consentedAt: new Date() }, supabase),
    ).rejects.toThrow("見本の保存に失敗しました");
    expect(errors).toHaveBeenCalledWith("[catalog-references] orphan file left:", expect.stringMatching(/^1111/), "gone");
  });
});

describe("isUsableOwnCatalogReference", () => {
  test("本人の見本で、作り直しになっていないものだけを探す", async () => {
    const { supabase, dbCalls } = client({ select: { data: { id: "ref-1" }, error: null } });

    await expect(isUsableOwnCatalogReference({ userId: USER, referenceId: "ref-1" }, supabase)).resolves.toBe(true);
    expect(dbCalls).toEqual(
      expect.arrayContaining([
        ["eq", ["id", "ref-1"]],
        ["eq", ["user_id", USER]],
        ["is", ["rejected_at", null]],
      ]),
    );
  });

  test("見つからなければ false・DB のエラーは投げる", async () => {
    await expect(
      isUsableOwnCatalogReference({ userId: USER, referenceId: "x" }, client({ select: { data: null, error: null } }).supabase),
    ).resolves.toBe(false);
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      isUsableOwnCatalogReference(
        { userId: USER, referenceId: "x" },
        client({ select: { data: null, error: { message: "timeout" } } }).supabase,
      ),
    ).rejects.toThrow("見本の確認に失敗しました");
  });
});

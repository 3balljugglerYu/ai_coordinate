/** @jest-environment node */

/**
 * 見本の「使える見本・使えない見本」への同意(consent-repository)。
 *
 * ここで守ること(計画書 §10):
 *  - 同意の状態は、本人の同意の行と、本人の見本のいちばん新しい作り直しの時刻から決める
 *    (同意が無い・同意のあとに作り直しになったら、同意の画面がもう一度要る)
 *  - DB のエラーは投げる。/free で使う判定(hasCatalogReferenceConsent)だけは false にする(同意の画面をもう一度出す)
 *  - 「わかりました」を押した時刻を、本人ごとに1行残す(もう一度押したら書き換える)
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCatalogReferenceConsentState,
  hasCatalogReferenceConsent,
  recordCatalogReferenceConsent,
} from "@/features/catalog-references/lib/consent-repository";

type Result = { data: unknown; error: { message: string } | null };

/** 表ごとに答えを決められる、問い合わせを記録するだけの client */
function client(results: { consents?: Result; images?: Result }) {
  const calls: Array<[string, string, unknown[]]> = [];
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "order", "limit", "maybeSingle", "upsert", "single"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([table, method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve(
        (table === "catalog_reference_consents" ? results.consents : results.images) ?? {
          data: null,
          error: null,
        },
      );
    return chain;
  });
  return { supabase: { from } as unknown as SupabaseClient, calls };
}

const USER = "11111111-1111-4111-8111-111111111111";
const CONSENTED = "2026-10-31T01:00:00.000Z";

describe("getCatalogReferenceConsentState", () => {
  test("同意したことが無ければ、同意の画面が要る", async () => {
    const { supabase } = client({ consents: { data: null, error: null }, images: { data: [], error: null } });

    await expect(getCatalogReferenceConsentState(USER, supabase)).resolves.toEqual({
      consentedAt: null,
      needsConsent: true,
    });
  });

  test("同意があり、そのあと作り直しが無ければ要らない(本人の同意の行と、本人の見本の作り直しを読む)", async () => {
    const { supabase, calls } = client({
      consents: { data: { consented_at: CONSENTED }, error: null },
      images: { data: [{ rejected_at: "2026-10-30T00:00:00.000Z" }], error: null },
    });

    await expect(getCatalogReferenceConsentState(USER, supabase)).resolves.toEqual({
      consentedAt: new Date(CONSENTED),
      needsConsent: false,
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["catalog_reference_consents", "eq", ["user_id", USER]],
        ["catalog_reference_images", "eq", ["user_id", USER]],
        ["catalog_reference_images", "not", ["rejected_at", "is", null]],
        ["catalog_reference_images", "order", ["rejected_at", { ascending: false }]],
        ["catalog_reference_images", "limit", [1]],
      ]),
    );
  });

  test("同意のあとに本人の見本が作り直しになったら、同意の画面がもう一度要る", async () => {
    const { supabase } = client({
      consents: { data: { consented_at: CONSENTED }, error: null },
      images: { data: [{ rejected_at: "2026-10-31T02:00:00.000Z" }], error: null },
    });

    await expect(getCatalogReferenceConsentState(USER, supabase)).resolves.toEqual({
      consentedAt: new Date(CONSENTED),
      needsConsent: true,
    });
  });

  test.each([
    ["同意の行", { consents: { data: null, error: { message: "timeout" } }, images: { data: [], error: null } }],
    ["作り直しの時刻", { consents: { data: null, error: null }, images: { data: null, error: { message: "timeout" } } }],
  ])("%s を読めなければ投げる", async (_label, results) => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(getCatalogReferenceConsentState(USER, client(results).supabase)).rejects.toThrow(
      "見本の同意の確認に失敗しました",
    );
  });
});

describe("hasCatalogReferenceConsent", () => {
  test("有効な同意があれば true・同意の画面が要れば false", async () => {
    await expect(
      hasCatalogReferenceConsent(
        USER,
        client({ consents: { data: { consented_at: CONSENTED }, error: null }, images: { data: [], error: null } })
          .supabase,
      ),
    ).resolves.toBe(true);
    await expect(
      hasCatalogReferenceConsent(
        USER,
        client({ consents: { data: null, error: null }, images: { data: [], error: null } }).supabase,
      ),
    ).resolves.toBe(false);
  });

  test("DB のエラーは投げずに false(同意の画面をもう一度出す)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      hasCatalogReferenceConsent(
        USER,
        client({ consents: { data: null, error: { message: "timeout" } }, images: { data: [], error: null } }).supabase,
      ),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("recordCatalogReferenceConsent", () => {
  test("本人の行に今の時刻を残し(あれば書き換え)、残した時刻を返す", async () => {
    const before = Date.now();
    const { supabase, calls } = client({ consents: { data: { consented_at: CONSENTED }, error: null } });

    await expect(recordCatalogReferenceConsent(USER, supabase)).resolves.toEqual(new Date(CONSENTED));
    const upsert = calls.find(([table, method]) => table === "catalog_reference_consents" && method === "upsert");
    const [row, options] = upsert?.[2] as [{ user_id: string; consented_at: string }, unknown];
    expect(row.user_id).toBe(USER);
    expect(new Date(row.consented_at).getTime()).toBeGreaterThanOrEqual(before);
    expect(options).toEqual({ onConflict: "user_id" });
  });

  test("残せなければ投げる", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordCatalogReferenceConsent(USER, client({ consents: { data: null, error: { message: "denied" } } }).supabase),
    ).rejects.toThrow("見本の同意を残せませんでした");
  });
});

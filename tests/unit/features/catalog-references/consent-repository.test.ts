/** @jest-environment node */

/**
 * 見本の「使える見本・使えない見本」への同意(consent-repository)。
 *
 * ここで守ること(計画書 §10):
 *  - 同意の状態は、本人の同意の行だけで決める(作り直しで無効になったかは DB のトリガーが revoked_at に入れる)
 *    有効な同意 = 行があって revoked_at が無い。一度でも同意したか = 行がある
 *  - DB のエラーは投げる。/free で使う値(getCatalogReferenceConsentSummary)だけは「同意なし・初めて」にする
 *  - 「わかりました」を押したことは、DB の関数で残す(時刻は DB の時計・無効の印を外す)
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCatalogReferenceConsentState,
  getCatalogReferenceConsentSummary,
  recordCatalogReferenceConsent,
} from "@/features/catalog-references/lib/consent-repository";

type Result = { data: unknown; error: { message: string } | null };

/** 問い合わせを記録し、決めた答えを返すだけの client */
function client(options: { select?: Result; rpc?: Result }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(options.select ?? { data: null, error: null });
  const supabase = {
    from: jest.fn((table: string) => {
      calls.push(["from", [table]]);
      return chain;
    }),
    rpc: jest.fn(async (...args: unknown[]) => {
      calls.push(["rpc", args]);
      return options.rpc ?? { data: null, error: null };
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

const USER = "11111111-1111-4111-8111-111111111111";
const CONSENTED = "2026-10-31T01:00:00+00:00";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getCatalogReferenceConsentState", () => {
  test("本人の同意の行を読む。行が無ければ、同意なし・初めて", async () => {
    const { supabase, calls } = client({ select: { data: null, error: null } });

    await expect(getCatalogReferenceConsentState(USER, supabase)).resolves.toEqual({
      consentedAt: null,
      consentedBefore: false,
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", ["catalog_reference_consents"]],
        ["select", ["consented_at, revoked_at"]],
        ["eq", ["user_id", USER]],
      ]),
    );
  });

  test("無効の印が無ければ、その時刻が有効な同意", async () => {
    const { supabase } = client({ select: { data: { consented_at: CONSENTED, revoked_at: null }, error: null } });

    await expect(getCatalogReferenceConsentState(USER, supabase)).resolves.toEqual({
      consentedAt: new Date(CONSENTED),
      consentedBefore: true,
    });
  });

  test("作り直しで無効になっていたら、有効な同意は無い(一度は同意している)", async () => {
    const { supabase } = client({
      select: { data: { consented_at: CONSENTED, revoked_at: "2026-10-31T02:00:00+00:00" }, error: null },
    });

    await expect(getCatalogReferenceConsentState(USER, supabase)).resolves.toEqual({
      consentedAt: null,
      consentedBefore: true,
    });
  });

  test("読めなければ投げる", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getCatalogReferenceConsentState(USER, client({ select: { data: null, error: { message: "timeout" } } }).supabase),
    ).rejects.toThrow("見本の同意の確認に失敗しました");
  });
});

describe("getCatalogReferenceConsentSummary", () => {
  test("有効な同意があるか・一度でも同意したかを返す", async () => {
    await expect(
      getCatalogReferenceConsentSummary(
        USER,
        client({ select: { data: { consented_at: CONSENTED, revoked_at: "2026-10-31T02:00:00+00:00" }, error: null } })
          .supabase,
      ),
    ).resolves.toEqual({ consented: false, consentedBefore: true });
  });

  test("読めなければ投げずに「同意なし・初めて」(同意の画面をもう一度出す)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      getCatalogReferenceConsentSummary(USER, client({ select: { data: null, error: { message: "timeout" } } }).supabase),
    ).resolves.toEqual({ consented: false, consentedBefore: false });
    expect(warn).toHaveBeenCalled();
  });
});

describe("recordCatalogReferenceConsent", () => {
  test("DB の関数で本人の同意を残し、DB が書いた時刻を返す", async () => {
    const { supabase, calls } = client({ rpc: { data: CONSENTED, error: null } });

    await expect(recordCatalogReferenceConsent(USER, supabase)).resolves.toEqual(new Date(CONSENTED));
    expect(calls).toContainEqual(["rpc", ["record_catalog_reference_consent", { p_user_id: USER }]]);
  });

  test.each([
    ["DB のエラー", { data: null, error: { message: "denied" } }],
    ["時刻が返らない", { data: null, error: null }],
  ])("%s なら投げる", async (_label, rpc) => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(recordCatalogReferenceConsent(USER, client({ rpc }).supabase)).rejects.toThrow(
      "見本の同意を残せませんでした",
    );
  });
});

/** @jest-environment node */

/**
 * 見本(参照画像)つきのカタログを作れる人かの判定(isInI2iCatalogAllowlist)。
 *
 * ここで守ること:
 *  - 決まりは DB の関数 is_in_i2i_catalog_allowlist に任せ、true のときだけ使える
 *  - ログインしていない・DB のエラー・投げた・答えが真偽値でない、はどれも使えない(fail-closed)
 */

const mockRpc = jest.fn();

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({ rpc: mockRpc })),
}));

import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";

beforeEach(() => {
  mockRpc.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("一覧で有効な人は使える(DB の関数に本人の ID を渡す)", async () => {
  mockRpc.mockResolvedValue({ data: true, error: null });

  await expect(isInI2iCatalogAllowlist("u1")).resolves.toBe(true);
  expect(mockRpc).toHaveBeenCalledWith("is_in_i2i_catalog_allowlist", { p_user_id: "u1" });
});

test("ログインしていなければ、DB に聞かずに使えない", async () => {
  await expect(isInI2iCatalogAllowlist(null)).resolves.toBe(false);
  await expect(isInI2iCatalogAllowlist(undefined)).resolves.toBe(false);
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([
  ["一覧に無い・無効", { data: false, error: null }],
  ["DB のエラー", { data: null, error: { message: "timeout" } }],
  ["答えが真偽値でない", { data: "true", error: null }],
])("%s → 使えない", async (_label, result) => {
  mockRpc.mockResolvedValue(result);

  await expect(isInI2iCatalogAllowlist("u1")).resolves.toBe(false);
});

test("呼び出しが投げても使えない", async () => {
  mockRpc.mockRejectedValue(new Error("network"));

  await expect(isInI2iCatalogAllowlist("u1")).resolves.toBe(false);
});

/**
 * `isCatalogFeatureEnabled` の真理値判定テスト。
 *
 * lib/env.ts は import 時に `env` を確定させるため、各ケースで
 * `jest.resetModules()` + `process.env` 設定 → 動的 import の順で読み直す。
 */

describe("isCatalogFeatureEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("未設定なら有効 (fail-open / デフォルト ON)", async () => {
    delete process.env.NEXT_PUBLIC_CATALOG_ENABLED;
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(true);
  });

  test('"true" なら有効', async () => {
    process.env.NEXT_PUBLIC_CATALOG_ENABLED = "true";
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(true);
  });

  test('"TRUE" (大文字) も有効', async () => {
    process.env.NEXT_PUBLIC_CATALOG_ENABLED = "TRUE";
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(true);
  });

  test('"1" なら有効', async () => {
    process.env.NEXT_PUBLIC_CATALOG_ENABLED = "1";
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(true);
  });

  test('"false" なら無効', async () => {
    process.env.NEXT_PUBLIC_CATALOG_ENABLED = "false";
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(false);
  });

  test('"0" なら無効', async () => {
    process.env.NEXT_PUBLIC_CATALOG_ENABLED = "0";
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(false);
  });

  test("空白だけの値は空文字扱いで有効 (デフォルト ON 維持)", async () => {
    process.env.NEXT_PUBLIC_CATALOG_ENABLED = "  ";
    const mod = await import("@/lib/env");
    expect(mod.isCatalogFeatureEnabled()).toBe(true);
  });
});

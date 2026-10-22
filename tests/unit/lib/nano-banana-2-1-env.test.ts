/**
 * lib/env.ts の Nano Banana 2.1(gemini-nano-banana-2.1)段階公開ヘルパーのテスト。
 *
 * - isNanoBanana21PubliclyEnabled: NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED === "true" のみ true
 * - isNanoBanana21Available: 公開フラグ OR 運営(isAdminViewer)
 *
 * docs/planning/nano-banana-2-1-implementation-plan.md Phase 3 / REQ-006。
 * GPT 2.5 の同じテスト(gpt-image-2-5-env.test.ts)と同じ形。
 */
describe("nano-banana-2.1 env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_PREVIEW_USER_IDS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isNanoBanana21PubliclyEnabled", () => {
    test('NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED が "true" のとき true を返す', async () => {
      process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = "true";
      const { isNanoBanana21PubliclyEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PubliclyEnabled()).toBe(true);
    });

    test("未設定のとき false を返す(既定は運営限定)", async () => {
      const { isNanoBanana21PubliclyEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PubliclyEnabled()).toBe(false);
    });

    test('"false" のとき false を返す', async () => {
      process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = "false";
      const { isNanoBanana21PubliclyEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PubliclyEnabled()).toBe(false);
    });

    test('"TRUE"(大文字)のとき false を返す(厳密比較)', async () => {
      process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = "TRUE";
      const { isNanoBanana21PubliclyEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PubliclyEnabled()).toBe(false);
    });
  });

  describe("isNanoBanana21Available", () => {
    test("フラグ OFF + 一般ユーザーは false", async () => {
      process.env.ADMIN_USER_IDS = "admin-1";
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available("user-1")).toBe(false);
    });

    test("フラグ OFF + null / undefined(未ログイン)は false", async () => {
      process.env.ADMIN_USER_IDS = "admin-1";
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available(null)).toBe(false);
      expect(isNanoBanana21Available(undefined)).toBe(false);
    });

    test("フラグ OFF でも ADMIN_USER_IDS のユーザーは true", async () => {
      process.env.ADMIN_USER_IDS = "admin-1,admin-2";
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available("admin-2")).toBe(true);
    });

    test("フラグ OFF でも ADMIN_PREVIEW_USER_IDS のユーザーは true(isAdminViewer 経由)", async () => {
      process.env.ADMIN_USER_IDS = "admin-1";
      process.env.ADMIN_PREVIEW_USER_IDS = "preview-1";
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available("preview-1")).toBe(true);
    });

    test("フラグ ON なら一般ユーザーも未ログインも true", async () => {
      process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = "true";
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available("user-1")).toBe(true);
      expect(isNanoBanana21Available(null)).toBe(true);
    });

    test("運営リストが未設定なら誰も true にならない(fail closed)", async () => {
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available("user-1")).toBe(false);
      expect(isNanoBanana21Available("")).toBe(false);
    });
  });
});

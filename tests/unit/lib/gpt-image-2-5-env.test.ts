/**
 * lib/env.ts の ChatGPT Images 2.5(gpt-image-2.5-flare)段階公開ヘルパーのテスト。
 *
 * - isGptImage25PubliclyEnabled: NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED === "true" のみ true
 * - isGptImage25Available: 公開フラグ OR 運営(isAdminViewer)
 *
 * docs/planning/gpt-image-2-5-flare-implementation-plan.md ADR-003 / REQ-006。
 * 各テストで jest.resetModules() + process.env 差し替えで env を再読込する。
 */
describe("gpt-image-2.5 env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED;
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_PREVIEW_USER_IDS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isGptImage25PubliclyEnabled", () => {
    test('NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED が "true" のとき true を返す', async () => {
      process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED = "true";
      const { isGptImage25PubliclyEnabled } = await import("@/lib/env");
      expect(isGptImage25PubliclyEnabled()).toBe(true);
    });

    test("未設定のとき false を返す(既定は運営限定)", async () => {
      const { isGptImage25PubliclyEnabled } = await import("@/lib/env");
      expect(isGptImage25PubliclyEnabled()).toBe(false);
    });

    test('"false" のとき false を返す', async () => {
      process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED = "false";
      const { isGptImage25PubliclyEnabled } = await import("@/lib/env");
      expect(isGptImage25PubliclyEnabled()).toBe(false);
    });

    test('"TRUE"(大文字)のとき false を返す(厳密比較)', async () => {
      process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED = "TRUE";
      const { isGptImage25PubliclyEnabled } = await import("@/lib/env");
      expect(isGptImage25PubliclyEnabled()).toBe(false);
    });
  });

  describe("isGptImage25Available", () => {
    test("フラグ OFF + 一般ユーザーは false", async () => {
      process.env.ADMIN_USER_IDS = "admin-1";
      const { isGptImage25Available } = await import("@/lib/env");
      expect(isGptImage25Available("user-1")).toBe(false);
    });

    test("フラグ OFF + null / undefined(未ログイン)は false", async () => {
      process.env.ADMIN_USER_IDS = "admin-1";
      const { isGptImage25Available } = await import("@/lib/env");
      expect(isGptImage25Available(null)).toBe(false);
      expect(isGptImage25Available(undefined)).toBe(false);
    });

    test("フラグ OFF でも ADMIN_USER_IDS のユーザーは true", async () => {
      process.env.ADMIN_USER_IDS = "admin-1,admin-2";
      const { isGptImage25Available } = await import("@/lib/env");
      expect(isGptImage25Available("admin-2")).toBe(true);
    });

    test("フラグ OFF でも ADMIN_PREVIEW_USER_IDS のユーザーは true(isAdminViewer 経由)", async () => {
      process.env.ADMIN_USER_IDS = "admin-1";
      process.env.ADMIN_PREVIEW_USER_IDS = "preview-1";
      const { isGptImage25Available } = await import("@/lib/env");
      expect(isGptImage25Available("preview-1")).toBe(true);
    });

    test("フラグ ON なら一般ユーザーも未ログインも true", async () => {
      process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED = "true";
      const { isGptImage25Available } = await import("@/lib/env");
      expect(isGptImage25Available("user-1")).toBe(true);
      expect(isGptImage25Available(null)).toBe(true);
    });

    test("運営リストが未設定なら誰も true にならない(fail closed)", async () => {
      const { isGptImage25Available } = await import("@/lib/env");
      expect(isGptImage25Available("user-1")).toBe(false);
      expect(isGptImage25Available("")).toBe(false);
    });
  });
});

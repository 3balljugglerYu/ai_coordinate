/**
 * lib/env.ts の Nano Banana 2.1(gemini-nano-banana-2.1)段階公開ヘルパーのテスト。
 *
 * - isNanoBanana21PubliclyEnabled: NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED === "true" か、公開の日時(2026-10-24 0:00 JST)以降
 * - isNanoBanana21Available: 公開 OR 運営(isAdminViewer)
 *
 * 既定では時刻を公開の 1 ミリ秒前に固定する(実行した日によって結果が変わらないように)。
 *
 * docs/planning/nano-banana-2-1-implementation-plan.md Phase 3 / REQ-006。
 * GPT 2.5 の同じテスト(gpt-image-2-5-env.test.ts)と同じ形。
 */
const LAUNCH_AT_MS = Date.parse("2026-10-24T00:00:00+09:00");

describe("nano-banana-2.1 env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(Date, "now").mockReturnValue(LAUNCH_AT_MS - 1);
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_PREVIEW_USER_IDS;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
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

    test("フラグが無くても、公開の日時(2026-10-24 0:00 JST)ちょうどから true", async () => {
      const { isNanoBanana21PubliclyEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PubliclyEnabled(LAUNCH_AT_MS - 1)).toBe(false);
      expect(isNanoBanana21PubliclyEnabled(LAUNCH_AT_MS)).toBe(true);
    });

    test("時刻を渡さなければ今の時刻で決まる", async () => {
      const { isNanoBanana21PubliclyEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PubliclyEnabled()).toBe(false);
      jest.spyOn(Date, "now").mockReturnValue(LAUNCH_AT_MS);
      expect(isNanoBanana21PubliclyEnabled()).toBe(true);
    });
  });

  describe("isNanoBanana21PublicFlagEnabled", () => {
    test("日時を過ぎてもフラグだけを見る(描画の途中で時刻を読まない場所用)", async () => {
      jest.spyOn(Date, "now").mockReturnValue(LAUNCH_AT_MS + 1);
      const { isNanoBanana21PublicFlagEnabled } = await import("@/lib/env");
      expect(isNanoBanana21PublicFlagEnabled()).toBe(false);
      process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = "true";
      jest.resetModules();
      const reloaded = await import("@/lib/env");
      expect(reloaded.isNanoBanana21PublicFlagEnabled()).toBe(true);
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

    test("公開の日時を過ぎたら、フラグが無くても一般ユーザーも未ログインも true", async () => {
      jest.spyOn(Date, "now").mockReturnValue(LAUNCH_AT_MS);
      const { isNanoBanana21Available } = await import("@/lib/env");
      expect(isNanoBanana21Available("user-1")).toBe(true);
      expect(isNanoBanana21Available(null)).toBe(true);
    });
  });
});

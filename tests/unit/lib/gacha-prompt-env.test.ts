/**
 * lib/env.ts のガチャプロンプト段階公開ヘルパーのテスト。
 *
 * isGachaPromptAvailable: NEXT_PUBLIC_GACHA_PROMPT_ENABLED === "true" OR 運営(isAdminViewer)。
 * カタログ刷新(NEXT_PUBLIC_USER_STYLES_ENABLED)とは独立していること。
 * 各テストで jest.resetModules() + process.env 差し替えで env を再読込する。
 */
describe("isGachaPromptAvailable", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED;
    delete process.env.NEXT_PUBLIC_GACHA_SPLIT_ENABLED;
    delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_PREVIEW_USER_IDS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("フラグ OFF + 一般ユーザーは false", async () => {
    process.env.ADMIN_USER_IDS = "admin-1";
    const { isGachaPromptAvailable } = await import("@/lib/env");
    expect(isGachaPromptAvailable("user-1")).toBe(false);
  });

  test("フラグ OFF でも運営は true", async () => {
    process.env.ADMIN_USER_IDS = "admin-1";
    const { isGachaPromptAvailable } = await import("@/lib/env");
    expect(isGachaPromptAvailable("admin-1")).toBe(true);
  });

  test('フラグが "true" なら一般ユーザーも true', async () => {
    process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED = "true";
    const { isGachaPromptAvailable } = await import("@/lib/env");
    expect(isGachaPromptAvailable("user-1")).toBe(true);
  });

  test("カタログ刷新のフラグを立てても、ガチャは一般ユーザーに出ない", async () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
    process.env.ADMIN_USER_IDS = "admin-1";
    const { isGachaPromptAvailable } = await import("@/lib/env");
    expect(isGachaPromptAvailable("user-1")).toBe(false);
  });

  test("未ログイン(null)はフラグ OFF なら false", async () => {
    process.env.ADMIN_USER_IDS = "admin-1";
    const { isGachaPromptAvailable } = await import("@/lib/env");
    expect(isGachaPromptAvailable(null)).toBe(false);
  });
});

describe("isGachaSplitAvailable(「ガチャに分ける」道具)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED;
    delete process.env.NEXT_PUBLIC_GACHA_SPLIT_ENABLED;
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_PREVIEW_USER_IDS;
    process.env.ADMIN_USER_IDS = "admin-1";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("フラグ OFF なら運営だけ", async () => {
    const { isGachaSplitAvailable } = await import("@/lib/env");
    expect(isGachaSplitAvailable("admin-1")).toBe(true);
    expect(isGachaSplitAvailable("user-1")).toBe(false);
    expect(isGachaSplitAvailable(null)).toBe(false);
  });

  test('フラグが "true" なら一般ユーザーも使える', async () => {
    process.env.NEXT_PUBLIC_GACHA_SPLIT_ENABLED = "true";
    const { isGachaSplitAvailable } = await import("@/lib/env");
    expect(isGachaSplitAvailable("user-1")).toBe(true);
  });

  test("ガチャを一般公開しても、道具は一般ユーザーに出ない(別のフラグ)", async () => {
    process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED = "true";
    const { isGachaPromptAvailable, isGachaSplitAvailable } = await import("@/lib/env");
    expect(isGachaPromptAvailable("user-1")).toBe(true);
    expect(isGachaSplitAvailable("user-1")).toBe(false);
  });
});

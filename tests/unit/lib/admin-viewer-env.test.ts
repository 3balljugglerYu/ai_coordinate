/**
 * lib/env.ts の admin 判定ヘルパー群のテスト。
 *
 * - getAdminUserIds / getAdminPreviewUserIds: CSV 解析
 * - isFullAdmin: フル admin だけ true (preview は false)
 * - isAdminViewer: フル admin と preview admin の両方で true
 *
 * 各テストで jest.resetModules() + process.env 差し替えで env を再読込する。
 */
describe("admin viewer env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getAdminUserIds", () => {
    test("ADMIN_USER_IDS 未設定/空文字なら空配列", async () => {
      delete process.env.ADMIN_USER_IDS;
      const { getAdminUserIds } = await import("@/lib/env");
      expect(getAdminUserIds()).toEqual([]);
    });

    test("カンマ区切りで複数 UUID をパースする", async () => {
      process.env.ADMIN_USER_IDS = "aaa, bbb,ccc";
      const { getAdminUserIds } = await import("@/lib/env");
      expect(getAdminUserIds()).toEqual(["aaa", "bbb", "ccc"]);
    });

    test("空白だけのエントリは無視される", async () => {
      process.env.ADMIN_USER_IDS = "aaa, ,bbb,";
      const { getAdminUserIds } = await import("@/lib/env");
      expect(getAdminUserIds()).toEqual(["aaa", "bbb"]);
    });
  });

  describe("getAdminPreviewUserIds", () => {
    test("ADMIN_PREVIEW_USER_IDS 未設定なら空配列", async () => {
      delete process.env.ADMIN_PREVIEW_USER_IDS;
      const { getAdminPreviewUserIds } = await import("@/lib/env");
      expect(getAdminPreviewUserIds()).toEqual([]);
    });

    test("カンマ区切りで複数 UUID をパースする", async () => {
      process.env.ADMIN_PREVIEW_USER_IDS = "pv1,pv2";
      const { getAdminPreviewUserIds } = await import("@/lib/env");
      expect(getAdminPreviewUserIds()).toEqual(["pv1", "pv2"]);
    });
  });

  describe("isFullAdmin", () => {
    test("null / undefined は false", async () => {
      const { isFullAdmin } = await import("@/lib/env");
      expect(isFullAdmin(null)).toBe(false);
      expect(isFullAdmin(undefined)).toBe(false);
    });

    test("ADMIN_USER_IDS に含まれていれば true", async () => {
      process.env.ADMIN_USER_IDS = "uid-1,uid-2";
      const { isFullAdmin } = await import("@/lib/env");
      expect(isFullAdmin("uid-1")).toBe(true);
      expect(isFullAdmin("uid-2")).toBe(true);
    });

    test("ADMIN_USER_IDS に含まれていなければ false (preview に含まれていても)", async () => {
      process.env.ADMIN_USER_IDS = "uid-1";
      process.env.ADMIN_PREVIEW_USER_IDS = "uid-99";
      const { isFullAdmin } = await import("@/lib/env");
      expect(isFullAdmin("uid-99")).toBe(false);
      expect(isFullAdmin("uid-other")).toBe(false);
    });
  });

  describe("isAdminViewer", () => {
    test("null / undefined は false", async () => {
      const { isAdminViewer } = await import("@/lib/env");
      expect(isAdminViewer(null)).toBe(false);
      expect(isAdminViewer(undefined)).toBe(false);
    });

    test("ADMIN_USER_IDS に含まれていれば true", async () => {
      process.env.ADMIN_USER_IDS = "uid-1";
      const { isAdminViewer } = await import("@/lib/env");
      expect(isAdminViewer("uid-1")).toBe(true);
    });

    test("ADMIN_PREVIEW_USER_IDS に含まれていれば true", async () => {
      process.env.ADMIN_USER_IDS = "uid-1";
      process.env.ADMIN_PREVIEW_USER_IDS = "uid-99";
      const { isAdminViewer } = await import("@/lib/env");
      expect(isAdminViewer("uid-99")).toBe(true);
    });

    test("どちらにも含まれていなければ false", async () => {
      process.env.ADMIN_USER_IDS = "uid-1";
      process.env.ADMIN_PREVIEW_USER_IDS = "uid-99";
      const { isAdminViewer } = await import("@/lib/env");
      expect(isAdminViewer("uid-stranger")).toBe(false);
    });
  });
});

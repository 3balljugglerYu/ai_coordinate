describe("Creator Looks env helper", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isCreatorLooksFeatureEnabled", () => {
    test('CREATOR_LOOKS_ENABLED が "true" のとき true を返す', async () => {
      process.env.CREATOR_LOOKS_ENABLED = "true";
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(true);
    });

    test('CREATOR_LOOKS_ENABLED が "1" のとき true を返す', async () => {
      process.env.CREATOR_LOOKS_ENABLED = "1";
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(true);
    });

    test('CREATOR_LOOKS_ENABLED が "TRUE" (大文字) でも有効化される (toLowerCase)', async () => {
      process.env.CREATOR_LOOKS_ENABLED = "TRUE";
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(true);
    });

    test('CREATOR_LOOKS_ENABLED が "false" のとき false (fail-closed)', async () => {
      process.env.CREATOR_LOOKS_ENABLED = "false";
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(false);
    });

    test("CREATOR_LOOKS_ENABLED 未設定のとき false (デフォルト fail-closed)", async () => {
      delete process.env.CREATOR_LOOKS_ENABLED;
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(false);
    });

    test('CREATOR_LOOKS_ENABLED が "" (空文字列) のとき false', async () => {
      process.env.CREATOR_LOOKS_ENABLED = "";
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(false);
    });

    test('CREATOR_LOOKS_ENABLED が "yes" のとき false (= 厳密、未知の値は無効扱い)', async () => {
      process.env.CREATOR_LOOKS_ENABLED = "yes";
      const { isCreatorLooksFeatureEnabled } = await import("@/lib/env");
      expect(isCreatorLooksFeatureEnabled()).toBe(false);
    });

    test("NEXT_PUBLIC_ プレフィックスは付いていない (= クライアントに露出しない)", async () => {
      // env.ts の envSchema に CREATOR_LOOKS_ENABLED が登録されているが、
      // NEXT_PUBLIC_CREATOR_LOOKS_ENABLED は登録されていない
      process.env.NEXT_PUBLIC_CREATOR_LOOKS_ENABLED = "true"; // クライアント露出版を設定
      delete process.env.CREATOR_LOOKS_ENABLED; // サーバ版を未設定
      const { isCreatorLooksFeatureEnabled, env } = await import("@/lib/env");
      // NEXT_PUBLIC 版があっても false (= NEXT_PUBLIC を参照していない)
      expect(isCreatorLooksFeatureEnabled()).toBe(false);
      // env オブジェクトにも NEXT_PUBLIC_CREATOR_LOOKS_ENABLED は含まれない
      expect("NEXT_PUBLIC_CREATOR_LOOKS_ENABLED" in env).toBe(false);
    });
  });
});

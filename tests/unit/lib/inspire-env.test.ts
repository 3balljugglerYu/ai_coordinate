describe("Inspire env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isInspireFeatureEnabled", () => {
    test('NEXT_PUBLIC_INSPIRE_ENABLED が "true" のとき true を返す', async () => {
      process.env.NEXT_PUBLIC_INSPIRE_ENABLED = "true";
      const { isInspireFeatureEnabled } = await import("@/lib/env");
      expect(isInspireFeatureEnabled()).toBe(true);
    });

    test('NEXT_PUBLIC_INSPIRE_ENABLED が "false" のとき false を返す', async () => {
      process.env.NEXT_PUBLIC_INSPIRE_ENABLED = "false";
      const { isInspireFeatureEnabled } = await import("@/lib/env");
      expect(isInspireFeatureEnabled()).toBe(false);
    });

    test("NEXT_PUBLIC_INSPIRE_ENABLED 未設定のとき false を返す", async () => {
      delete process.env.NEXT_PUBLIC_INSPIRE_ENABLED;
      const { isInspireFeatureEnabled } = await import("@/lib/env");
      expect(isInspireFeatureEnabled()).toBe(false);
    });

    test('NEXT_PUBLIC_INSPIRE_ENABLED が "TRUE"（大文字）のとき false を返す（厳密比較）', async () => {
      process.env.NEXT_PUBLIC_INSPIRE_ENABLED = "TRUE";
      const { isInspireFeatureEnabled } = await import("@/lib/env");
      expect(isInspireFeatureEnabled()).toBe(false);
    });
  });

  describe("isInspireHomeCarouselEnabled", () => {
    test('NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED が "true" のとき true を返す', async () => {
      process.env.NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED = "true";
      const { isInspireHomeCarouselEnabled } = await import("@/lib/env");
      expect(isInspireHomeCarouselEnabled()).toBe(true);
    });

    test("NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED 未設定のとき false を返す（MVP デフォルト OFF）", async () => {
      delete process.env.NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED;
      const { isInspireHomeCarouselEnabled } = await import("@/lib/env");
      expect(isInspireHomeCarouselEnabled()).toBe(false);
    });
  });

  describe("getInspireSubmissionAllowedUserIds", () => {
    test("INSPIRE_SUBMISSION_ALLOWED_USER_IDS 未設定のとき空配列を返す（fail-open）", async () => {
      delete process.env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS;
      const { getInspireSubmissionAllowedUserIds } = await import("@/lib/env");
      expect(getInspireSubmissionAllowedUserIds()).toEqual([]);
    });

    test("空文字のとき空配列を返す", async () => {
      process.env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS = "";
      const { getInspireSubmissionAllowedUserIds } = await import("@/lib/env");
      expect(getInspireSubmissionAllowedUserIds()).toEqual([]);
    });

    test("カンマ区切りの UUID を配列にパースする", async () => {
      process.env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS =
        "11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222";
      const { getInspireSubmissionAllowedUserIds } = await import("@/lib/env");
      expect(getInspireSubmissionAllowedUserIds()).toEqual([
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ]);
    });

    test("空白を含む値を trim する", async () => {
      process.env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS =
        " 11111111-1111-1111-1111-111111111111 , 22222222-2222-2222-2222-222222222222 ";
      const { getInspireSubmissionAllowedUserIds } = await import("@/lib/env");
      expect(getInspireSubmissionAllowedUserIds()).toEqual([
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ]);
    });

    test("空のセグメントを除外する", async () => {
      process.env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS =
        "11111111-1111-1111-1111-111111111111,,22222222-2222-2222-2222-222222222222";
      const { getInspireSubmissionAllowedUserIds } = await import("@/lib/env");
      expect(getInspireSubmissionAllowedUserIds()).toEqual([
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ]);
    });
  });
});

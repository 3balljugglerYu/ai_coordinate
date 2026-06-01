/** @jest-environment node */

jest.mock("@/lib/supabase/admin");

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function buildAllowlistChain(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

async function setupAdminClient(
  factory: () => Record<string, unknown> | (() => Record<string, unknown>),
): Promise<void> {
  // resetModules 後の new instance を取得して mockImplementation する
  const { createAdminClient } = await import("@/lib/supabase/admin");
  (createAdminClient as jest.Mock).mockImplementation(
    typeof factory === "function" ? factory : () => factory,
  );
}

async function setupAdminClientToThrow(error: Error): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  (createAdminClient as jest.Mock).mockImplementation(() => {
    throw error;
  });
}

describe("isAdminUser", () => {
  test("ADMIN_USER_IDS が未設定なら全員 false", async () => {
    delete process.env.ADMIN_USER_IDS;
    const { isAdminUser } = await import("@/lib/auth/creator-looks");
    expect(isAdminUser({ id: "u1" })).toBe(false);
  });

  test("ADMIN_USER_IDS に含まれる user_id は true", async () => {
    process.env.ADMIN_USER_IDS = "u1,u2";
    const { isAdminUser } = await import("@/lib/auth/creator-looks");
    expect(isAdminUser({ id: "u1" })).toBe(true);
    expect(isAdminUser({ id: "u2" })).toBe(true);
    expect(isAdminUser({ id: "u3" })).toBe(false);
  });

  test("user が null なら false", async () => {
    process.env.ADMIN_USER_IDS = "u1";
    const { isAdminUser } = await import("@/lib/auth/creator-looks");
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
});

describe("isInCreatorLooksAllowlist", () => {
  test("user_id が null なら false (= fail-closed)", async () => {
    const { isInCreatorLooksAllowlist } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isInCreatorLooksAllowlist(null)).toBe(false);
    expect(await isInCreatorLooksAllowlist(undefined)).toBe(false);
    expect(await isInCreatorLooksAllowlist("")).toBe(false);
  });

  test("allowlist テーブルにレコード無しなら false", async () => {
    const chain = buildAllowlistChain({ data: null, error: null });
    await setupAdminClient(() => ({
      from: jest.fn(() => chain),
    }));
    const { isInCreatorLooksAllowlist } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isInCreatorLooksAllowlist("u1")).toBe(false);
  });

  test("allowlist にレコード有り (is_active=true) なら true", async () => {
    const chain = buildAllowlistChain({
      data: { user_id: "u1" },
      error: null,
    });
    await setupAdminClient(() => ({
      from: jest.fn(() => chain),
    }));
    const { isInCreatorLooksAllowlist } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isInCreatorLooksAllowlist("u1")).toBe(true);
  });

  test("DB エラー時は false (= fail-closed)", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const chain = buildAllowlistChain({
      data: null,
      error: { message: "permission denied" },
    });
    await setupAdminClient(() => ({
      from: jest.fn(() => chain),
    }));
    const { isInCreatorLooksAllowlist } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isInCreatorLooksAllowlist("u1")).toBe(false);
    consoleWarn.mockRestore();
  });

  test("createAdminClient が throw しても false (= fail-closed)", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await setupAdminClientToThrow(new Error("boom"));
    const { isInCreatorLooksAllowlist } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isInCreatorLooksAllowlist("u1")).toBe(false);
    consoleWarn.mockRestore();
  });
});

describe("isCreatorLooksEnabledForUser", () => {
  test("env が false なら admin でも false (= 緊急停止可能)", async () => {
    delete process.env.CREATOR_LOOKS_ENABLED;
    process.env.ADMIN_USER_IDS = "u1";
    const { isCreatorLooksEnabledForUser } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isCreatorLooksEnabledForUser({ id: "u1" })).toBe(false);
  });

  test("env=true + user が null なら false", async () => {
    process.env.CREATOR_LOOKS_ENABLED = "true";
    const { isCreatorLooksEnabledForUser } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isCreatorLooksEnabledForUser(null)).toBe(false);
    expect(await isCreatorLooksEnabledForUser(undefined)).toBe(false);
  });

  test("env=true + admin なら true", async () => {
    process.env.CREATOR_LOOKS_ENABLED = "true";
    process.env.ADMIN_USER_IDS = "u1,u2";
    const { isCreatorLooksEnabledForUser } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isCreatorLooksEnabledForUser({ id: "u1" })).toBe(true);
  });

  test("env=true + 非 admin + allowlist 該当 なら true", async () => {
    process.env.CREATOR_LOOKS_ENABLED = "true";
    process.env.ADMIN_USER_IDS = "admin1";
    const chain = buildAllowlistChain({
      data: { user_id: "u1" },
      error: null,
    });
    await setupAdminClient(() => ({
      from: jest.fn(() => chain),
    }));
    const { isCreatorLooksEnabledForUser } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isCreatorLooksEnabledForUser({ id: "u1" })).toBe(true);
  });

  test("env=true + 非 admin + allowlist 非該当 なら false (= Stage 1 デフォルト)", async () => {
    process.env.CREATOR_LOOKS_ENABLED = "true";
    process.env.ADMIN_USER_IDS = "admin1";
    const chain = buildAllowlistChain({ data: null, error: null });
    await setupAdminClient(() => ({
      from: jest.fn(() => chain),
    }));
    const { isCreatorLooksEnabledForUser } = await import(
      "@/lib/auth/creator-looks"
    );
    expect(await isCreatorLooksEnabledForUser({ id: "u1" })).toBe(false);
  });
});

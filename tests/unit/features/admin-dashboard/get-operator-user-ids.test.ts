/** @jest-environment node */

/**
 * 運営とみなす user_id の一覧(getOperatorUserIds)。
 *
 * 2026-10-26、審査用のアカウントが env にも admin_users にも入っておらず、
 * 新規登録の数にまざった。そこで「集計から除く一覧」(analytics_excluded_users)を
 * 4つ目の元として足した。ここで守ること:
 *  - 4つの元の和集合になる(どれか1つだけだと取りこぼす)
 *  - 既定では、読めなかった元があっても読めた分で続ける(今の呼び出し元の動き)
 *  - strict では、どれかが読めなければ throw する
 *    (内部アカウントがまざった数を、正しい数のように見せないため)
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/env", () => ({
  getAdminUserIds: jest.fn(),
  getAdminPreviewUserIds: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/admin-dashboard/lib/analytics-exclusion-repository", () => ({
  listAnalyticsExcludedUserIds: jest.fn(),
}));

import {
  getBuiltInOperatorUserIds,
  getOperatorUserIds,
} from "@/features/admin-dashboard/lib/get-operator-user-ids";
import { getAdminPreviewUserIds, getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAnalyticsExcludedUserIds } from "@/features/admin-dashboard/lib/analytics-exclusion-repository";

const ENV_ADMIN = "11111111-1111-4111-8111-111111111111";
const ENV_PREVIEW = "22222222-2222-4222-8222-222222222222";
const DB_ADMIN = "33333333-3333-4333-8333-333333333333";
const EXCLUDED = "44444444-4444-4444-8444-444444444444";

const mockGetAdminUserIds = getAdminUserIds as jest.MockedFunction<typeof getAdminUserIds>;
const mockGetPreview = getAdminPreviewUserIds as jest.MockedFunction<
  typeof getAdminPreviewUserIds
>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockListExcluded = listAnalyticsExcludedUserIds as jest.MockedFunction<
  typeof listAnalyticsExcludedUserIds
>;

function adminUsersClient(result: { data: unknown; error: unknown }) {
  return {
    from: jest.fn((table: string) => {
      if (table !== "admin_users") throw new Error(`unexpected table ${table}`);
      return { select: jest.fn(() => Promise.resolve(result)) };
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe("getOperatorUserIds", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminUserIds.mockReturnValue([ENV_ADMIN]);
    mockGetPreview.mockReturnValue([ENV_PREVIEW, ENV_ADMIN]);
    mockCreateAdminClient.mockReturnValue(
      adminUsersClient({ data: [{ user_id: DB_ADMIN }], error: null }),
    );
    mockListExcluded.mockResolvedValue([EXCLUDED]);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test("env 2つ・admin_users・集計から除く一覧の和集合を、重複なしで返す", async () => {
    // admin_users と一覧の両方に入っている人も1回だけ
    mockListExcluded.mockResolvedValue([EXCLUDED, DB_ADMIN]);
    await expect(getOperatorUserIds()).resolves.toEqual(
      [ENV_ADMIN, ENV_PREVIEW, DB_ADMIN, EXCLUDED].sort(),
    );
  });

  test("集計から除く一覧は、admin_users と同じクライアントで読む", async () => {
    await getOperatorUserIds();
    expect(mockListExcluded).toHaveBeenCalledWith(mockCreateAdminClient.mock.results[0].value);
  });

  test("既定: 集計から除く一覧を読めなくても、ほかの元で続ける", async () => {
    mockListExcluded.mockRejectedValue(new Error("db down"));
    await expect(getOperatorUserIds()).resolves.toEqual(
      [ENV_ADMIN, ENV_PREVIEW, DB_ADMIN].sort(),
    );
    expect(consoleError).toHaveBeenCalled();
  });

  test("既定: admin_users を読めなくても、ほかの元で続ける", async () => {
    mockCreateAdminClient.mockReturnValue(
      adminUsersClient({ data: null, error: { message: "denied" } }),
    );
    await expect(getOperatorUserIds()).resolves.toEqual(
      [ENV_ADMIN, ENV_PREVIEW, EXCLUDED].sort(),
    );
  });

  test("既定: クライアントを作れなければ env の分だけを返す", async () => {
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("no service role key");
    });
    await expect(getOperatorUserIds()).resolves.toEqual([ENV_ADMIN, ENV_PREVIEW].sort());
    expect(mockListExcluded).not.toHaveBeenCalled();
  });

  test("strict: 集計から除く一覧を読めなければ throw する", async () => {
    mockListExcluded.mockRejectedValue(new Error("db down"));
    await expect(getOperatorUserIds({ strict: true })).rejects.toThrow("db down");
  });

  test("strict: admin_users を読めなければ throw する", async () => {
    mockCreateAdminClient.mockReturnValue(
      adminUsersClient({ data: null, error: { message: "denied" } }),
    );
    await expect(getOperatorUserIds({ strict: true })).rejects.toThrow(
      "admin_users の取得に失敗しました: denied",
    );
  });

  test("strict: クライアントを作れなければ throw する", async () => {
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("no service role key");
    });
    await expect(getOperatorUserIds({ strict: true })).rejects.toThrow(
      "no service role key",
    );
  });

  test("strict: すべて読めれば、既定と同じ和集合を返す", async () => {
    await expect(getOperatorUserIds({ strict: true })).resolves.toEqual(
      [ENV_ADMIN, ENV_PREVIEW, DB_ADMIN, EXCLUDED].sort(),
    );
  });
});

describe("getBuiltInOperatorUserIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminUserIds.mockReturnValue([ENV_ADMIN]);
    mockGetPreview.mockReturnValue([ENV_PREVIEW]);
    mockCreateAdminClient.mockReturnValue(
      adminUsersClient({ data: [{ user_id: DB_ADMIN }], error: null }),
    );
  });

  test("env 2つと admin_users だけを返し、集計から除く一覧は読まない", async () => {
    await expect(getBuiltInOperatorUserIds()).resolves.toEqual(
      [ENV_ADMIN, ENV_PREVIEW, DB_ADMIN].sort(),
    );
    expect(mockListExcluded).not.toHaveBeenCalled();
  });

  test("admin_users を読めなければ env の分だけを返す", async () => {
    mockCreateAdminClient.mockReturnValue(
      adminUsersClient({ data: null, error: { message: "denied" } }),
    );
    await expect(getBuiltInOperatorUserIds()).resolves.toEqual([ENV_ADMIN, ENV_PREVIEW].sort());
  });
});

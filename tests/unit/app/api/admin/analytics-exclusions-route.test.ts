/** @jest-environment node */

/**
 * 集計から除く一覧の API(/api/admin/analytics-exclusions)。
 *
 * ここで守ること:
 *  - 管理者以外は読めず、書けない
 *  - 足す人(added_by)は、ログイン中の管理者で決める(本文から受け取らない)
 *  - いないユーザー・空の理由は断る。同じ人は 409 で、今の行を変えない
 *  - 足す・外すを監査ログに残す
 */

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/admin-audit", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("@/features/creators/lib/creator-allowlist-repository", () => ({
  profileExistsForUserId: jest.fn(),
}));

jest.mock("@/features/admin-dashboard/lib/analytics-exclusion-repository", () => {
  class AnalyticsExclusionExistsError extends Error {
    constructor() {
      super("すでに集計から除いています");
    }
  }
  return {
    AnalyticsExclusionExistsError,
    addAnalyticsExclusion: jest.fn(),
    listAnalyticsExclusions: jest.fn(),
    removeAnalyticsExclusion: jest.fn(),
  };
});

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/analytics-exclusions/route";
import { DELETE } from "@/app/api/admin/analytics-exclusions/[userId]/route";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { profileExistsForUserId } from "@/features/creators/lib/creator-allowlist-repository";
import {
  AnalyticsExclusionExistsError,
  addAnalyticsExclusion,
  listAnalyticsExclusions,
  removeAnalyticsExclusion,
} from "@/features/admin-dashboard/lib/analytics-exclusion-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;
const mockAudit = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockProfileExists = profileExistsForUserId as jest.MockedFunction<
  typeof profileExistsForUserId
>;
const mockAdd = addAnalyticsExclusion as jest.MockedFunction<typeof addAnalyticsExclusion>;
const mockList = listAnalyticsExclusions as jest.MockedFunction<
  typeof listAnalyticsExclusions
>;
const mockRemove = removeAnalyticsExclusion as jest.MockedFunction<
  typeof removeAnalyticsExclusion
>;

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/analytics-exclusions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteRequest(userId: string) {
  return [
    new NextRequest(`http://localhost/api/admin/analytics-exclusions/${userId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ userId }) },
  ] as const;
}

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as never);
  mockSameOrigin.mockReturnValue(null);
  mockProfileExists.mockResolvedValue(true);
  mockAdd.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(true);
  mockAudit.mockResolvedValue(undefined as never);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe("GET", () => {
  test("一覧を返す", async () => {
    mockList.mockResolvedValue([
      {
        userId: TARGET_ID,
        nickname: "あかね",
        reason: "外部審査用",
        addedBy: ADMIN_ID,
        addedByNickname: "運営",
        createdAt: "2026-10-26T00:00:00.000Z",
      },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ userId: TARGET_ID, reason: "外部審査用" }),
    ]);
  });

  test("管理者でなければ断り、一覧を読まない", async () => {
    mockRequireAdmin.mockRejectedValue(forbidden());
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  test("読めなければ 500", async () => {
    mockList.mockRejectedValue(new Error("db"));
    expect((await GET()).status).toBe(500);
  });
});

describe("POST", () => {
  test("足して、監査ログに残す。added_by はログイン中の管理者", async () => {
    const response = await POST(
      postRequest({ userId: TARGET_ID, reason: "  外部審査用  ", addedBy: OTHER_ID }),
    );
    expect(response.status).toBe(200);
    expect(mockAdd).toHaveBeenCalledWith({
      userId: TARGET_ID,
      reason: "外部審査用",
      addedBy: ADMIN_ID,
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        actionType: "analytics_exclusion_add",
        targetType: "analytics_excluded_users",
        targetId: TARGET_ID,
      }),
    );
  });

  test("管理者でなければ断り、書かない", async () => {
    mockRequireAdmin.mockRejectedValue(forbidden());
    const response = await POST(postRequest({ userId: TARGET_ID, reason: "x" }));
    expect(response.status).toBe(403);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("別のサイトからのリクエストは断る", async () => {
    mockSameOrigin.mockReturnValue(forbidden());
    const response = await POST(postRequest({ userId: TARGET_ID, reason: "x" }));
    expect(response.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test.each([
    ["ユーザーIDが UUID でない", { userId: "abc", reason: "x" }, "ユーザーIDが不正です"],
    ["理由が空", { userId: TARGET_ID, reason: " " }, "理由を入力してください"],
    [
      "理由が201文字",
      { userId: TARGET_ID, reason: "あ".repeat(201) },
      "理由は200文字以内で入力してください",
    ],
  ])("%s なら 400", async (_label, body, error) => {
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("本文が JSON でなければ 400", async () => {
    const response = await POST(postRequest("{"));
    expect(response.status).toBe(400);
  });

  test("いないユーザーなら 400 で、書かない", async () => {
    mockProfileExists.mockResolvedValue(false);
    const response = await POST(postRequest({ userId: TARGET_ID, reason: "x" }));
    expect(response.status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("すでに入っていれば 409 で、監査ログに残さない", async () => {
    mockAdd.mockRejectedValue(new AnalyticsExclusionExistsError());
    const response = await POST(postRequest({ userId: TARGET_ID, reason: "x" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "すでに集計から除いています" });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("書けなければ 500", async () => {
    mockAdd.mockRejectedValue(new Error("db"));
    const response = await POST(postRequest({ userId: TARGET_ID, reason: "x" }));
    expect(response.status).toBe(500);
  });
});

describe("DELETE", () => {
  test("外して、監査ログに残す", async () => {
    const response = await DELETE(...deleteRequest(TARGET_ID));
    expect(response.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith(TARGET_ID);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "analytics_exclusion_remove",
        targetId: TARGET_ID,
      }),
    );
  });

  test("一覧に入っていなければ 404 で、監査ログに残さない", async () => {
    mockRemove.mockResolvedValue(false);
    const response = await DELETE(...deleteRequest(TARGET_ID));
    expect(response.status).toBe(404);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("ユーザーIDが UUID でなければ 400", async () => {
    const response = await DELETE(...deleteRequest("abc"));
    expect(response.status).toBe(400);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test("管理者でなければ断り、消さない", async () => {
    mockRequireAdmin.mockRejectedValue(forbidden());
    const response = await DELETE(...deleteRequest(TARGET_ID));
    expect(response.status).toBe(403);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

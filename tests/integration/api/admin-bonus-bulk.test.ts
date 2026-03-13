/** @jest-environment node */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { POST as bulkLookupPost } from "@/app/api/admin/bonus/bulk-lookup/route";
import { POST as grantBatchPost } from "@/app/api/admin/bonus/grant-batch/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { revalidateTag } from "next/cache";

jest.mock("@/lib/auth");
jest.mock("@/lib/supabase/admin");
jest.mock("@/lib/admin-audit");
jest.mock("next/cache");

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockCreateAdminClient =
  createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>;

type JsonRecord = Record<string, unknown>;

function createRequest(
  url: string,
  body: unknown
): NextRequest {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function createSupabaseMock() {
  const rpc = jest.fn();
  const from = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn(),
      }),
    }),
  });
  return {
    rpc,
    from,
    _setRpcResult: (data: unknown, error: unknown = null) => {
      rpc.mockResolvedValueOnce({ data, error });
    },
    _setFromSelectResult: (data: unknown) => {
      from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data }),
          }),
        }),
      });
    },
  };
}

describe("Admin Bonus Bulk integration tests from EARS specs", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    supabaseMock = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabaseMock as never);
    mockLogAdminAction.mockResolvedValue(undefined);
    mockRevalidateTag.mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe("bulk-lookup API", () => {
    describe("BBG-001 bulkLookup", () => {
      test("bulkLookup_有効なメール配列の場合_usersとnot_foundを返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
          email: "admin@example.com",
        } as never);
        supabaseMock._setRpcResult([
          {
            email: "user1@example.com",
            user_id: "user-1",
            balance: 100,
          },
        ]);
        const request = createRequest(
          "http://localhost/api/admin/bonus/bulk-lookup",
          { emails: ["user1@example.com", "unknown@example.com"] }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await bulkLookupPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(200);
        expect(body.users).toEqual([
          {
            email: "user1@example.com",
            user_id: "user-1",
            balance: 100,
          },
        ]);
        expect(body.not_found).toEqual(["unknown@example.com"]);
        expect(supabaseMock.rpc).toHaveBeenCalledWith("get_user_ids_by_emails", {
          p_emails: ["user1@example.com", "unknown@example.com"],
        });
      });
    });

    describe("BBG-002 bulkLookup", () => {
      test("bulkLookup_未認証管理者の場合_401を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockRejectedValueOnce(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        );
        const request = createRequest(
          "http://localhost/api/admin/bonus/bulk-lookup",
          { emails: ["user@example.com"] }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await bulkLookupPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
        expect(supabaseMock.rpc).not.toHaveBeenCalled();
      });
    });

    describe("BBG-003 bulkLookup", () => {
      test("bulkLookup_emails空の場合_400を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
        } as never);
        const request = createRequest(
          "http://localhost/api/admin/bonus/bulk-lookup",
          { emails: [] }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await bulkLookupPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(400);
        expect(body.error).toBe("メールアドレスを1件以上入力してください");
        expect(supabaseMock.rpc).not.toHaveBeenCalled();
      });

      test("bulkLookup_emails超過の場合_400を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
        } as never);
        const emails = Array.from({ length: 301 }, (_, i) =>
          `user${i}@example.com`
        );
        const request = createRequest(
          "http://localhost/api/admin/bonus/bulk-lookup",
          { emails }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await bulkLookupPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(400);
        expect(body.error).toBe(
          "メールアドレスは300件以内で入力してください"
        );
        expect(supabaseMock.rpc).not.toHaveBeenCalled();
      });
    });

    describe("BBG-004 bulkLookup", () => {
      test("bulkLookup_RPCエラーの場合_500を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
        } as never);
        supabaseMock._setRpcResult(null, { message: "RPC failed" });
        const request = createRequest(
          "http://localhost/api/admin/bonus/bulk-lookup",
          { emails: ["user@example.com"] }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await bulkLookupPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(500);
        expect(body.error).toBe("登録確認に失敗しました");
      });
    });
  });

  describe("grant-batch API", () => {
    describe("BBG-005 grantBatch", () => {
      test("grantBatch_有効なgrantsの場合_結果とサマリを返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
          email: "admin@example.com",
        } as never);
        supabaseMock._setRpcResult([
          {
            email: "user1@example.com",
            user_id: "user-1",
            balance: 50,
          },
        ]);
        supabaseMock.rpc.mockResolvedValueOnce({
          data: [{ amount_granted: 100 }],
          error: null,
        });
        supabaseMock._setFromSelectResult({ balance: 150 });
        const request = createRequest(
          "http://localhost/api/admin/bonus/grant-batch",
          {
            grants: [
              { email: "user1@example.com", amount: 100 },
              { email: "unknown@example.com", amount: 50 },
            ],
            balance_type: "period_limited",
            reason: "テスト付与",
            send_notification: false,
          }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await grantBatchPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.results).toHaveLength(2);
        expect(body.results[0]).toMatchObject({
          email: "user1@example.com",
          status: "success",
          user_id: "user-1",
          balance_before: 50,
          amount_granted: 100,
          balance_after: 150,
        });
        expect(body.results[1]).toMatchObject({
          email: "unknown@example.com",
          status: "skipped",
          error: "登録なし",
        });
        expect(body.summary).toEqual({
          total: 2,
          success: 1,
          skipped: 1,
          error: 0,
        });
        expect(mockLogAdminAction).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: "bonus_bulk_grant",
            metadata: expect.objectContaining({
              total: 2,
              success: 1,
              skipped: 1,
              error: 0,
            }),
          })
        );
      });
    });

    describe("BBG-006 grantBatch", () => {
      test("grantBatch_未認証管理者の場合_401を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockRejectedValueOnce(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        );
        const request = createRequest(
          "http://localhost/api/admin/bonus/grant-batch",
          {
            grants: [{ email: "user@example.com", amount: 10 }],
            balance_type: "period_limited",
            reason: "テスト",
          }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await grantBatchPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
        expect(mockCreateAdminClient).not.toHaveBeenCalled();
      });
    });

    describe("BBG-007 grantBatch", () => {
      test("grantBatch_不正スキーマの場合_400を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
        } as never);
        const request = createRequest(
          "http://localhost/api/admin/bonus/grant-batch",
          {
            grants: [{ email: "user@example.com", amount: 0 }],
            balance_type: "period_limited",
            reason: "テスト",
          }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await grantBatchPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(400);
        expect(body.error).toBe(
          "付与ペルコイン数は1以上の整数で入力してください"
        );
      });
    });

    describe("BBG-008 grantBatch", () => {
      test("grantBatch_検索エラーの場合_500を返す", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
        } as never);
        supabaseMock._setRpcResult(null, { message: "Lookup failed" });
        const request = createRequest(
          "http://localhost/api/admin/bonus/grant-batch",
          {
            grants: [{ email: "user@example.com", amount: 10 }],
            balance_type: "period_limited",
            reason: "テスト",
          }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await grantBatchPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(500);
        expect(body.error).toBe("ユーザー検索に失敗しました");
      });
    });

    describe("BBG-009 grantBatch", () => {
      test("grantBatch_付与RPCエラーの場合_エラー記録して継続する", async () => {
        // ============================================================
        // Arrange
        // ============================================================
        mockRequireAdmin.mockResolvedValue({
          id: "admin-123",
        } as never);
        supabaseMock._setRpcResult([
          { email: "user1@example.com", user_id: "user-1", balance: 0 },
          { email: "user2@example.com", user_id: "user-2", balance: 0 },
        ]);
        supabaseMock.rpc
          .mockResolvedValueOnce({
            data: null,
            error: { message: "grant failed for user1" },
          })
          .mockResolvedValueOnce({
            data: [{ amount_granted: 50 }],
            error: null,
          });
        supabaseMock._setFromSelectResult({ balance: 50 });
        const request = createRequest(
          "http://localhost/api/admin/bonus/grant-batch",
          {
            grants: [
              { email: "user1@example.com", amount: 10 },
              { email: "user2@example.com", amount: 50 },
            ],
            balance_type: "period_limited",
            reason: "テスト",
          }
        );

        // ============================================================
        // Act
        // ============================================================
        const response = await grantBatchPost(request);
        const body = await readJson(response);

        // ============================================================
        // Assert
        // ============================================================
        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.results[0]).toMatchObject({
          email: "user1@example.com",
          status: "error",
          error: "grant failed for user1",
        });
        expect(body.results[1]).toMatchObject({
          email: "user2@example.com",
          status: "success",
          amount_granted: 50,
        });
        expect(body.summary).toEqual({
          total: 2,
          success: 1,
          skipped: 0,
          error: 1,
        });
      });
    });
  });
});

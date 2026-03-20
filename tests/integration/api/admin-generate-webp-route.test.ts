/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/lib/supabase/admin");
jest.mock("@/features/generation/lib/webp-storage");

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/generate-webp/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockEnsureWebPVariants = ensureWebPVariants as jest.MockedFunction<
  typeof ensureWebPVariants
>;

function createRequest(path: string, method: "GET" | "POST"): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
  });
}

function createBatchQuery(images: Array<{ id: string }>) {
  const query = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({
      data: images,
      error: null,
    }),
  };

  return query;
}

function createCountQuery(count: number) {
  return {
    count,
    error: null,
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  };
}

describe("admin generate-webp routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
    } as never);
    mockEnsureWebPVariants.mockResolvedValue({
      status: "created",
      thumbPath: "thumb.webp",
      displayPath: "display.webp",
    });
  });

  test("POST /api/admin/generate-webp_非管理者は403を返す", async () => {
    // Spec: AGWP-001
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST(
      createRequest("/api/admin/generate-webp?scope=posted", "POST")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });

  test("POST /api/admin/generate-webp_scope未指定時はpostedを既定にして欠損画像を処理する", async () => {
    // Spec: AGWP-002
    const query = createBatchQuery([{ id: "image-1" }, { id: "image-2" }]);
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn(() => query),
    } as never);
    mockEnsureWebPVariants
      .mockResolvedValueOnce({
        status: "created",
        thumbPath: "thumb.webp",
        displayPath: "display.webp",
      })
      .mockResolvedValueOnce({
        status: "skipped",
        reason: "already-exists",
      });

    const response = await POST(
      createRequest("/api/admin/generate-webp?limit=2&offset=0", "POST")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("is_posted", true);
    expect(query.order).toHaveBeenNthCalledWith(1, "posted_at", {
      ascending: false,
    });
    expect(query.order).toHaveBeenNthCalledWith(2, "created_at", {
      ascending: false,
    });
    expect(mockEnsureWebPVariants).toHaveBeenNthCalledWith(
      1,
      "image-1",
      expect.objectContaining({
        image: expect.objectContaining({ id: "image-1" }),
      })
    );
    expect(mockEnsureWebPVariants).toHaveBeenNthCalledWith(
      2,
      "image-2",
      expect.objectContaining({
        image: expect.objectContaining({ id: "image-2" }),
      })
    );
    expect(body.scope).toBe("posted");
    expect(body.results).toEqual({
      success: 1,
      failed: 0,
      skipped: 1,
      errors: [],
    });
  });

  test("GET /api/admin/generate-webp_scope=allの場合は全件countを返す", async () => {
    // Spec: AGWP-003
    const query = createCountQuery(34);
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn(() => query),
    } as never);

    const response = await GET(
      createRequest("/api/admin/generate-webp?scope=all", "GET")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.eq).not.toHaveBeenCalled();
    expect(body).toEqual({
      success: true,
      count: 34,
      scope: "all",
    });
  });

  test("GET /api/admin/generate-webp_非管理者は403を返す", async () => {
    // Spec: AGWP-004
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await GET(createRequest("/api/admin/generate-webp", "GET"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });
});

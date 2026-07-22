/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/admin-audit", () => ({
  logAdminAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/features/generation-prompts/lib/admin-repository", () => ({
  listAllPromptOverrides: jest.fn(),
  upsertPromptOverride: jest.fn(),
  deletePromptOverride: jest.fn(),
}));

jest.mock("next/cache", () => ({
  cacheTag: jest.fn(),
  cacheLife: jest.fn(),
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/generation-prompts/route";
import {
  DELETE,
  PUT,
} from "@/app/api/admin/generation-prompts/[key]/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  deletePromptOverride,
  listAllPromptOverrides,
  upsertPromptOverride,
} from "@/features/generation-prompts/lib/admin-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;
const mockListAll = listAllPromptOverrides as jest.MockedFunction<
  typeof listAllPromptOverrides
>;
const mockUpsert = upsertPromptOverride as jest.MockedFunction<
  typeof upsertPromptOverride
>;
const mockDelete = deletePromptOverride as jest.MockedFunction<
  typeof deletePromptOverride
>;

const FAKE_ADMIN = { id: "admin-1", email: "admin@example.com" } as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/admin/generation-prompts", () => {
  test("non-admin はそのまま 401/403 NextResponse を返す", async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("admin なら全 registry key + override + 孤立 row を返す", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockListAll.mockResolvedValue([
      {
        prompt_key: "style.base_prefix",
        content: "X",
        created_by: "u",
        updated_by: "u",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        prompt_key: "deprecated.something",
        content: "orphan",
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        prompt_key: string;
        override: { content: string } | null;
      }>;
      orphans: Array<{ prompt_key: string }>;
    };
    // registry key が網羅されている
    expect(body.items.length).toBeGreaterThan(0);
    // override がある key を確認
    const styleBase = body.items.find(
      (i) => i.prompt_key === "style.base_prefix",
    );
    expect(styleBase?.override?.content).toBe("X");
    // 孤立 row は orphans に
    expect(body.orphans).toEqual([
      expect.objectContaining({ prompt_key: "deprecated.something" }),
    ]);
  });

  test("admin で listAllPromptOverrides が throw すると 500", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockListAll.mockRejectedValue(new Error("DB down"));
    const res = await GET();
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

describe("PUT /api/admin/generation-prompts/[key]", () => {
  function makePutRequest(body: unknown) {
    return new NextRequest("http://localhost/api/admin/generation-prompts/k", {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  test("non-admin は 403", async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
    });
    const res = await PUT(makePutRequest({ content: "x" }), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(403);
  });

  test("registry に無い key は 400", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    const res = await PUT(makePutRequest({ content: "x" }), {
      params: Promise.resolve({ key: "unknown.key" }),
    });
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("JSON parse 失敗は 400", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    const res = await PUT(makePutRequest("not json"), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(400);
  });

  test("body が配列など非 object は空 content 扱いで 400", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    const res = await PUT(makePutRequest([1, 2, 3]), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(400);
  });

  test("空 content は 400", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    const res = await PUT(makePutRequest({ content: "   " }), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(400);
  });

  test("100000 文字超過は 400", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    const res = await PUT(makePutRequest({ content: "x".repeat(100001) }), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(400);
  });

  test("10000 超〜100000 以内は許可 (上限緩和後)", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockUpsert.mockResolvedValue({ previousContent: null });
    const res = await PUT(makePutRequest({ content: "x".repeat(50000) }), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(200);
  });

  test("正常系は upsert + audit log + revalidate を呼ぶ", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockUpsert.mockResolvedValue({ previousContent: "OLD" });
    const res = await PUT(makePutRequest({ content: "NEW CONTENT" }), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; warnings: string[] };
    expect(body.ok).toBe(true);
    expect(body.warnings).toEqual([]);
    expect(mockUpsert).toHaveBeenCalledWith({
      key: "style.base_prefix",
      content: "NEW CONTENT",
      userId: "admin-1",
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "prompt_override_update",
        targetType: "prompt_override",
        targetId: "style.base_prefix",
      }),
    );
  });

  test("未サポート変数を含む content は 200 + warning", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockUpsert.mockResolvedValue({ previousContent: null });
    // style.base_prefix は variables なし → {{foo}} は未知扱い
    const res = await PUT(
      makePutRequest({ content: "Hello {{foo}}" }),
      { params: Promise.resolve({ key: "style.base_prefix" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; warnings: string[] };
    expect(body.warnings.some((w) => w.includes("{{foo}}"))).toBe(true);
  });

  test("upsert が throw すると 500", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockUpsert.mockRejectedValue(new Error("DB down"));
    const res = await PUT(makePutRequest({ content: "x" }), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

describe("DELETE /api/admin/generation-prompts/[key]", () => {
  function makeDeleteRequest() {
    return new NextRequest("http://localhost/api/admin/generation-prompts/k", {
      method: "DELETE",
    });
  }

  test("non-admin は 403", async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
    });
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(403);
  });

  test("registry に無い key + DB に row も無ければ 404", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockDelete.mockResolvedValue({ previousContent: null });
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ key: "unknown.orphan" }),
    });
    expect(res.status).toBe(404);
  });

  test("孤立 row (registry なし + DB あり) は削除可能", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockDelete.mockResolvedValue({ previousContent: "orphan content" });
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ key: "unknown.orphan" }),
    });
    expect(res.status).toBe(200);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "prompt_override_reset",
        targetId: "unknown.orphan",
        metadata: expect.objectContaining({ is_orphan: true }),
      }),
    );
  });

  test("registry key の override 削除は 200 + audit log", async () => {
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockDelete.mockResolvedValue({ previousContent: "WAS" });
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(200);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "prompt_override_reset",
        targetId: "style.base_prefix",
        metadata: expect.objectContaining({ is_orphan: false }),
      }),
    );
  });

  test("delete が throw すると 500", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireAdmin.mockResolvedValue(FAKE_ADMIN);
    mockDelete.mockRejectedValue(new Error("DB down"));
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ key: "style.base_prefix" }),
    });
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/lib/supabase/admin");
jest.mock("@/lib/security/same-origin");
jest.mock("sharp");

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { POST } from "@/app/api/admin/collection-unlock-hero/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<
  typeof requireAdmin
>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockEnsureSameOrigin = ensureSameOrigin as jest.MockedFunction<
  typeof ensureSameOrigin
>;
const mockSharp = sharp as unknown as jest.Mock;

const VALID_KEY = "collectible_wafer_sticker_god_petit_6p";
// "hello" の base64(デコードして 5 バイト → 0 < size < 10MB を満たす)。
const VALID_IMAGE_B64 = "aGVsbG8=";

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/collection-unlock-hero", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockUpload(result: { error: unknown } = { error: null }) {
  const upload = jest.fn().mockResolvedValue(result);
  mockCreateAdminClient.mockReturnValue({
    storage: { from: jest.fn().mockReturnValue({ upload }) },
  } as never);
  return upload;
}

describe("POST /api/admin/collection-unlock-hero", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureSameOrigin.mockReturnValue(null); // 同一オリジン = 通過
    mockRequireAdmin.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
    } as never);
    mockSharp.mockReturnValue({
      metadata: jest
        .fn()
        .mockResolvedValue({ format: "png", width: 600, height: 600 }),
    });
  });

  test("同一オリジン違反は ensureSameOrigin の応答を返す", async () => {
    mockEnsureSameOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "forbidden" }, { status: 403 }),
    );
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(403);
  });

  test("非管理者は requireAdmin の応答(403)を返す", async () => {
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(403);
  });

  test("不正なカテゴリ key は 400", async () => {
    const res = await POST(
      createRequest({ categoryKey: "Invalid Key!", imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(400);
  });

  test("画像が空は 400", async () => {
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: "" }),
    );
    expect(res.status).toBe(400);
  });

  test("対応外フォーマット(gif)は 400", async () => {
    mockSharp.mockReturnValueOnce({
      metadata: jest
        .fn()
        .mockResolvedValue({ format: "gif", width: 600, height: 600 }),
    });
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(400);
  });

  test("寸法が小さすぎる(256px未満)は 400", async () => {
    mockSharp.mockReturnValueOnce({
      metadata: jest
        .fn()
        .mockResolvedValue({ format: "png", width: 100, height: 100 }),
    });
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(400);
  });

  test("正常: path と実寸を返し generated-images に保存する", async () => {
    const upload = mockUpload();
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      path: string;
      width: number;
      height: number;
    };
    expect(json.width).toBe(600);
    expect(json.height).toBe(600);
    expect(json.path).toMatch(
      new RegExp(`^collection-unlock-heroes/${VALID_KEY}/[0-9a-f-]+\\.png$`),
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  test("アップロード失敗は 500", async () => {
    mockUpload({ error: { message: "boom" } });
    const res = await POST(
      createRequest({ categoryKey: VALID_KEY, imageBase64: VALID_IMAGE_B64 }),
    );
    expect(res.status).toBe(500);
  });
});

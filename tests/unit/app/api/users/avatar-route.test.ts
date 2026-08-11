/** @jest-environment node */

/**
 * POST /api/users/[userId]/avatar のテスト。
 *
 * ここが誤ると (a) 原寸のまま保存されて全画面のアイコンが重くなる、
 * (b) 変換に失敗したときアップロードごと失敗する、のどちらかが起きる。
 * 本番では 44 件で合計 34MB（中央値 746KB・最大 2.0MB）になっていた。
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/generation/lib/webp-converter", () => ({
  convertToWebP: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/users/[userId]/avatar/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { convertToWebP } from "@/features/generation/lib/webp-converter";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockConvertToWebP = convertToWebP as jest.MockedFunction<typeof convertToWebP>;

const USER_ID = "11111111-1111-4111-8111-111111111111";

interface UploadCall {
  path: string;
  body: unknown;
  options: { contentType?: string } | undefined;
}

function mockSupabase() {
  const uploads: UploadCall[] = [];
  const upload = jest.fn(
    (path: string, body: unknown, options?: { contentType?: string }) => {
      uploads.push({ path, body, options });
      return Promise.resolve({ data: { path }, error: null });
    }
  );

  mockCreateClient.mockResolvedValue({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn(() =>
        Promise.resolve({ data: { avatar_url: null }, error: null })
      ),
    })),
    storage: {
      from: jest.fn(() => ({
        upload,
        getPublicUrl: jest.fn((path: string) => ({
          data: { publicUrl: `https://example.test/${path}` },
        })),
        remove: jest.fn(() => Promise.resolve({ error: null })),
      })),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return uploads;
}

function buildRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.set("file", file);
  return new NextRequest(`http://localhost/api/users/${USER_ID}/avatar`, {
    method: "POST",
    body: formData,
  });
}

/** 2MB 相当の PNG に見せかけたファイル（本番の実データと同じ規模）。 */
function bigPngFile(): File {
  return new File([new Uint8Array(2 * 1024 * 1024)], "avatar.png", {
    type: "image/png",
  });
}

const params = Promise.resolve({ userId: USER_ID });

describe("POST /api/users/[userId]/avatar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
    mockConvertToWebP.mockResolvedValue(Buffer.from("webp-bytes"));
  });

  test("256px の WebP へ縮めて保存する", async () => {
    const uploads = mockSupabase();

    const response = await POST(buildRequest(bigPngFile()), { params });

    expect(response.status).toBe(200);
    expect(mockConvertToWebP).toHaveBeenCalledWith(expect.any(Buffer), {
      maxWidth: 256,
      maxHeight: 256,
      quality: 80,
    });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toMatch(/^avatars\/.+\.webp$/);
    expect(uploads[0].body).toEqual(Buffer.from("webp-bytes"));
    expect(uploads[0].options?.contentType).toBe("image/webp");
  });

  test("拡張子は元の MIME ではなく変換結果で決める", async () => {
    const uploads = mockSupabase();

    await POST(
      buildRequest(
        new File([new Uint8Array(16)], "avatar.jpg", { type: "image/jpeg" })
      ),
      { params }
    );

    expect(uploads[0].path.endsWith(".webp")).toBe(true);
  });

  test("変換に失敗しても元のファイルで保存を続ける(アップロードを失敗させない)", async () => {
    const uploads = mockSupabase();
    mockConvertToWebP.mockRejectedValue(new Error("unsupported format"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildRequest(bigPngFile()), { params });

    expect(response.status).toBe(200);
    expect(uploads).toHaveLength(1);
    // 元の拡張子・元のファイル本体で保存される
    expect(uploads[0].path.endsWith(".png")).toBe(true);
    expect(uploads[0].options?.contentType).toBeUndefined();
    errorSpy.mockRestore();
  });

  test("他人のアバターは変更できない", async () => {
    mockSupabase();
    mockGetUser.mockResolvedValue({ id: "another-user" } as never);

    const response = await POST(buildRequest(bigPngFile()), { params });

    expect(response.status).toBe(403);
    expect(mockConvertToWebP).not.toHaveBeenCalled();
  });

  test("10MB 超は受け付けない(変換を試みる前に弾く)", async () => {
    mockSupabase();
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });

    const response = await POST(buildRequest(file), { params });

    expect(response.status).toBe(400);
    expect(mockConvertToWebP).not.toHaveBeenCalled();
  });

  test("画像以外は受け付けない", async () => {
    mockSupabase();
    const file = new File([new Uint8Array(16)], "a.txt", { type: "text/plain" });

    const response = await POST(buildRequest(file), { params });

    expect(response.status).toBe(400);
    expect(mockConvertToWebP).not.toHaveBeenCalled();
  });
});

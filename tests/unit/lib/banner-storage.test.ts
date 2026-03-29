/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/generation/lib/webp-converter", () => ({
  convertToWebP: jest.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { convertToWebP } from "@/features/generation/lib/webp-converter";
import {
  deleteBannerImage,
  uploadBannerImage,
} from "@/features/banners/lib/banner-storage";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockConvertToWebP = convertToWebP as jest.MockedFunction<
  typeof convertToWebP
>;

const CONVERTED_WEBP_BUFFER = Buffer.from("webp-image-bytes");
const ALLOWED_MIME_TYPES = ["image/webp", "image/jpeg", "image/png"];

type StorageError = {
  message?: string;
  statusCode?: number | string;
};

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

function createMockFile(contents: string, type = "image/png") {
  const inputBuffer = Buffer.from(contents);
  const arrayBuffer = jest.fn().mockResolvedValue(toArrayBuffer(inputBuffer));

  return {
    file: {
      arrayBuffer,
      type,
    } as unknown as File,
    arrayBuffer,
    inputBuffer,
  };
}

function createSupabaseStorageMock({
  bucketError = null,
  uploadError = null,
  removeError = null,
  publicUrl = "https://example.com/banners/banner-1.webp",
  uploadedPath = "banner-1.webp",
}: {
  bucketError?: StorageError | null;
  uploadError?: StorageError | null;
  removeError?: StorageError | null;
  publicUrl?: string;
  uploadedPath?: string;
} = {}) {
  const upload = jest.fn().mockResolvedValue({
    data: uploadError ? null : { path: uploadedPath },
    error: uploadError,
  });
  const getPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl },
  });
  const remove = jest.fn().mockResolvedValue({
    error: removeError,
  });
  const bucketApi = {
    upload,
    getPublicUrl,
    remove,
  };
  const from = jest.fn(() => bucketApi);
  const createBucket = jest.fn().mockResolvedValue({
    error: bucketError,
  });

  return {
    client: {
      storage: {
        createBucket,
        from,
      },
    },
    createBucket,
    from,
    upload,
    getPublicUrl,
    remove,
  };
}

describe("banner-storage", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockCreateAdminClient.mockReset();
    mockConvertToWebP.mockReset();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockConvertToWebP.mockResolvedValue(CONVERTED_WEBP_BUFFER);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("uploadBannerImage_読める画像ファイルの場合_WebP変換して公開URLを返す", async () => {
    // Spec: BSTORE-001
    const { file, arrayBuffer, inputBuffer } = createMockFile("image-bytes");
    const supabase = createSupabaseStorageMock({
      // Fixed: Return a different persisted path so the test verifies the helper
      // uses storage.data.path instead of the local upload request path.
      uploadedPath: "persisted/banner-1.webp",
      publicUrl: "https://example.com/banners/persisted/banner-1.webp",
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    const result = await uploadBannerImage(file, "banner-1");

    expect(supabase.createBucket).toHaveBeenCalledWith("banners", {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(mockConvertToWebP).toHaveBeenCalledWith(inputBuffer, {
      maxWidth: 1280,
      quality: 85,
    });
    expect(supabase.upload).toHaveBeenCalledWith(
      "banner-1.webp",
      CONVERTED_WEBP_BUFFER,
      {
        contentType: "image/webp",
        upsert: true,
      }
    );
    expect(supabase.getPublicUrl).toHaveBeenCalledWith("persisted/banner-1.webp");
    expect(result).toEqual({
      imageUrl: "https://example.com/banners/persisted/banner-1.webp",
      storagePath: "persisted/banner-1.webp",
    });
  });

  test("uploadBannerImage_既存bannerIdの場合_保存済みオブジェクトを上書きする", async () => {
    // Spec: BSTORE-001
    const { file } = createMockFile("existing-image", "image/webp");
    const supabase = createSupabaseStorageMock({
      publicUrl: "https://example.com/banners/banner-1-latest.webp",
      uploadedPath: "banner-1.webp",
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    const result = await uploadBannerImage(file, "banner-1");

    expect(supabase.upload).toHaveBeenCalledWith(
      "banner-1.webp",
      CONVERTED_WEBP_BUFFER,
      expect.objectContaining({
        upsert: true,
      })
    );
    expect(result).toEqual({
      imageUrl: "https://example.com/banners/banner-1-latest.webp",
      storagePath: "banner-1.webp",
    });
  });

  test("uploadBannerImage_バケットが既に存在する場合_アップロード処理を継続する", async () => {
    // Spec: BSTORE-002
    const { file } = createMockFile("image-bytes");
    const supabase = createSupabaseStorageMock({
      bucketError: { statusCode: 409, message: "" },
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await uploadBannerImage(file, "banner-1");

    expect(mockConvertToWebP).toHaveBeenCalledTimes(1);
    expect(supabase.upload).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test("uploadBannerImage_statusCodeなしでalreadyexists文言がある場合_アップロード処理を継続する", async () => {
    // Spec: BSTORE-002
    const { file } = createMockFile("image-bytes");
    const supabase = createSupabaseStorageMock({
      bucketError: { message: "Bucket Already Exists" },
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await uploadBannerImage(file, "banner-2");

    expect(mockConvertToWebP).toHaveBeenCalledTimes(1);
    expect(supabase.upload).toHaveBeenCalledWith(
      "banner-2.webp",
      CONVERTED_WEBP_BUFFER,
      expect.objectContaining({
        upsert: true,
      })
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test("uploadBannerImage_バケット作成失敗の場合_ローカライズ済みエラーを投げる", async () => {
    // Spec: BSTORE-003
    const { file, arrayBuffer } = createMockFile("image-bytes");
    const bucketError = { statusCode: 500, message: "permission denied" };
    const supabase = createSupabaseStorageMock({
      bucketError,
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await expect(uploadBannerImage(file, "banner-1")).rejects.toThrow(
      "バケットの作成に失敗しました: permission denied"
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Banner bucket creation error:",
      bucketError
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mockConvertToWebP).not.toHaveBeenCalled();
    expect(supabase.upload).not.toHaveBeenCalled();
  });

  test("uploadBannerImage_ファイル読み取り前のバケット作成失敗の場合_ファイルを読まない", async () => {
    // Spec: BSTORE-003
    const { file, arrayBuffer } = createMockFile("image-bytes");
    const supabase = createSupabaseStorageMock({
      bucketError: { message: "" },
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await expect(uploadBannerImage(file, "banner-3")).rejects.toThrow(
      "バケットの作成に失敗しました: "
    );

    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test("uploadBannerImage_Storageアップロード失敗の場合_ローカライズ済みエラーを投げる", async () => {
    // Spec: BSTORE-004
    const { file } = createMockFile("image-bytes");
    const uploadError = { message: "upload failed" };
    const supabase = createSupabaseStorageMock({
      uploadError,
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await expect(uploadBannerImage(file, "banner-1")).rejects.toThrow(
      "バナー画像のアップロードに失敗しました: upload failed"
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Banner storage upload error:",
      uploadError
    );
    expect(supabase.getPublicUrl).not.toHaveBeenCalled();
  });

  test("uploadBannerImage_変換後にアップロード失敗した場合_公開URLを返さない", async () => {
    // Spec: BSTORE-004
    const { file } = createMockFile("image-bytes");
    const supabase = createSupabaseStorageMock({
      uploadError: { message: "" },
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await expect(uploadBannerImage(file, "banner-4")).rejects.toThrow(
      "バナー画像のアップロードに失敗しました: "
    );

    expect(mockConvertToWebP).toHaveBeenCalledTimes(1);
    expect(supabase.getPublicUrl).not.toHaveBeenCalled();
  });

  test("deleteBannerImage_storagePath指定時_バナー画像を削除する", async () => {
    // Spec: BSTORE-005
    const supabase = createSupabaseStorageMock();
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await deleteBannerImage("nested/path/banner-1.webp");

    expect(supabase.remove).toHaveBeenCalledWith(["nested/path/banner-1.webp"]);
  });

  test("deleteBannerImage_ネストしたstoragePathの場合_そのままのpathを渡す", async () => {
    // Spec: BSTORE-005
    const supabase = createSupabaseStorageMock();
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await deleteBannerImage("folder/sub/banner-2.webp");

    expect(supabase.remove).toHaveBeenCalledWith(["folder/sub/banner-2.webp"]);
  });

  test("deleteBannerImage_同じstoragePathを繰り返し削除する場合_各呼び出しを独立して委譲する", async () => {
    // Spec: BSTORE-005
    // Fixed: Exercise the documented repeated-delete edge case instead of only
    // verifying one successful delete per test.
    const supabase = createSupabaseStorageMock();
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await deleteBannerImage("folder/sub/banner-2.webp");
    await deleteBannerImage("folder/sub/banner-2.webp");

    expect(supabase.remove).toHaveBeenNthCalledWith(1, [
      "folder/sub/banner-2.webp",
    ]);
    expect(supabase.remove).toHaveBeenNthCalledWith(2, [
      "folder/sub/banner-2.webp",
    ]);
    expect(supabase.remove).toHaveBeenCalledTimes(2);
  });

  test("deleteBannerImage_Storage削除失敗の場合_ローカライズ済みエラーを投げる", async () => {
    // Spec: BSTORE-006
    const removeError = { message: "temporary unavailable" };
    const supabase = createSupabaseStorageMock({
      removeError,
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await expect(deleteBannerImage("nested/path/banner-3.webp")).rejects.toThrow(
      "バナー画像の削除に失敗しました: temporary unavailable"
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Banner storage delete error:",
      removeError
    );
  });

  test("deleteBannerImage_一時的な削除失敗の場合_リトライせずエラーを投げる", async () => {
    // Spec: BSTORE-006
    const supabase = createSupabaseStorageMock({
      removeError: { message: "" },
    });
    mockCreateAdminClient.mockReturnValue(supabase.client as never);

    await expect(deleteBannerImage("nested/path/banner-4.webp")).rejects.toThrow(
      "バナー画像の削除に失敗しました: "
    );

    expect(supabase.remove).toHaveBeenCalledTimes(1);
  });
});

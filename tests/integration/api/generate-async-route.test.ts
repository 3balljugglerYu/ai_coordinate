/** @jest-environment node */

jest.mock("@/features/generation/lib/heic-converter", () => {
  const actual = jest.requireActual("@/features/generation/lib/heic-converter");
  return {
    ...actual,
    convertHeicBase64ToJpeg: jest.fn(),
  };
});

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/generate-async/route";
import {
  generateAsyncRouteHandlers,
  postGenerateAsyncRoute,
} from "@/app/api/generate-async/handler";
import type { AsyncGenerationJobRepository } from "@/features/generation/lib/async-generation-job-repository";
import { convertHeicBase64ToJpeg } from "@/features/generation/lib/heic-converter";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/features/generation/lib/prompt-validation";

type JsonRecord = Record<string, unknown>;
const VALID_SOURCE_IMAGE_STOCK_ID = "11111111-1111-4111-8111-111111111111";

function createRequest(body: unknown): NextRequest {
  const request = new Request("http://localhost/api/generate-async", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "accept-language": "ja",
    },
    body: JSON.stringify(body),
  });

  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: {
      get: () => undefined,
    },
  }) as NextRequest;
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function createAsyncGenerationJobRepositoryMock(): jest.Mocked<AsyncGenerationJobRepository> {
  return {
    findSourceImageStock: jest.fn(),
    uploadSourceImage: jest.fn(),
    getSourceImagePublicUrl: jest.fn(),
    getUserCreditBalance: jest.fn(),
    createImageJob: jest.fn(),
    sendImageJobQueueMessage: jest.fn(),
  };
}

describe("GenerateAsyncRoute integration tests from EARS specs", () => {
  let getUserFn: jest.Mock;
  let jobRepository: jest.Mocked<AsyncGenerationJobRepository>;
  let invokeImageWorkerFn: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;
  let originalFetch: typeof global.fetch;
  let convertHeicBase64ToJpegMock: jest.MockedFunction<
    typeof convertHeicBase64ToJpeg
  >;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
    jobRepository = createAsyncGenerationJobRepositoryMock();
    invokeImageWorkerFn = jest.fn();

    jobRepository.findSourceImageStock.mockResolvedValue({
      data: {
        id: VALID_SOURCE_IMAGE_STOCK_ID,
        image_url: "https://cdn.example.com/stock.png",
      },
      error: null,
    });
    jobRepository.uploadSourceImage.mockResolvedValue({
      data: { path: "temp/user-123/source.png" },
      error: null,
    });
    jobRepository.getSourceImagePublicUrl.mockReturnValue(
      "https://cdn.example.com/temp/user-123/source.png"
    );
    jobRepository.getUserCreditBalance.mockResolvedValue({
      data: { balance: 100 },
      error: null,
    });
    jobRepository.createImageJob.mockResolvedValue({
      data: { id: "job-001", status: "queued" },
      error: null,
    });
    jobRepository.sendImageJobQueueMessage.mockResolvedValue({
      error: null,
    });

    convertHeicBase64ToJpegMock =
      convertHeicBase64ToJpeg as jest.MockedFunction<
        typeof convertHeicBase64ToJpeg
      >;
    convertHeicBase64ToJpegMock.mockReset();
    convertHeicBase64ToJpegMock.mockResolvedValue({
      base64: Buffer.from("converted-image-bytes").toString("base64"),
      mimeType: "image/jpeg",
    });

    originalFetch = global.fetch;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      // keep test output deterministic
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe("GASYNC-001 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_有効リクエストかつ残高十分の場合_200でjobIdとstatusを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
        invokeImageWorkerFn,
        supabaseUrl: "https://example.supabase.co",
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(body).toEqual({
        jobId: "job-001",
        status: "queued",
      });
      expect(jobRepository.createImageJob).toHaveBeenCalledTimes(1);
      expect(jobRepository.createImageJob).toHaveBeenCalledWith({
        user_id: "user-123",
        prompt_text: "linen jacket",
        input_image_url: "https://cdn.example.com/stock.png",
        source_image_stock_id: VALID_SOURCE_IMAGE_STOCK_ID,
        source_image_type: "illustration",
        generation_type: "coordinate",
        model: "gemini-3.1-flash-image-preview-512",
        background_mode: "keep",
        background_change: false,
        status: "queued",
        processing_stage: "queued",
        attempts: 0,
      });
      expect(jobRepository.sendImageJobQueueMessage).toHaveBeenCalledWith(
        "job-001"
      );
      expect(invokeImageWorkerFn).toHaveBeenCalledWith(
        "https://example.supabase.co/functions/v1/image-gen-worker"
      );
    });
  });

  describe("GASYNC-002 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_旧2_5モデル指定の場合_新しい0_5Kモデルへ正規化する", async () => {
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
        model: "gemini-2.5-flash-image",
      });

      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
        invokeImageWorkerFn,
        supabaseUrl: "https://example.supabase.co",
      });
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({
        jobId: "job-001",
        status: "queued",
      });
      expect(jobRepository.createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.1-flash-image-preview-512",
        })
      );
    });

    test("postGenerateAsyncRoute_未認証ユーザーの場合_401を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      getUserFn.mockResolvedValueOnce(null);
      const request = createRequest({ prompt: "linen jacket" });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(401);
      expect(body.error).toBe("認証が必要です");
      expect(jobRepository.getUserCreditBalance).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-003 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_不正スキーマの場合_400と先頭バリデーションメッセージを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest({ prompt: "" });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(400);
      expect(body.error).toBe("着せ替え内容を入力してください");
      expect(jobRepository.getUserCreditBalance).not.toHaveBeenCalled();
    });

    test("postGenerateAsyncRoute_元画像未指定の場合_400を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest({ prompt: "linen jacket" });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(400);
      expect(body.error).toBe(
        "人物画像をアップロードまたはストック画像を選択してください"
      );
      expect(jobRepository.getUserCreditBalance).not.toHaveBeenCalled();
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("postGenerateAsyncRoute_プロンプトが上限超過の場合_400と詳細メッセージを返す", async () => {
      const request = createRequest({
        prompt: "a".repeat(GENERATION_PROMPT_MAX_LENGTH + 1),
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe(
        `着せ替え内容は${GENERATION_PROMPT_MAX_LENGTH}文字以内で入力してください`
      );
      expect(jobRepository.getUserCreditBalance).not.toHaveBeenCalled();
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-004 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_sourceImageStockId指定の場合_ストック画像URLとIDを使用する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const sourceImageStockId = VALID_SOURCE_IMAGE_STOCK_ID;
      jobRepository.findSourceImageStock.mockResolvedValueOnce({
        data: {
          id: sourceImageStockId,
          image_url: "https://cdn.example.com/source-stock.png",
        },
        error: null,
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId,
        sourceImageBase64: Buffer.from("should-not-upload").toString("base64"),
        sourceImageMimeType: "image/png",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(body.jobId).toBe("job-001");
      expect(jobRepository.findSourceImageStock).toHaveBeenCalledWith(
        sourceImageStockId,
        "user-123"
      );
      expect(jobRepository.uploadSourceImage).not.toHaveBeenCalled();

      const inserted = jobRepository.createImageJob.mock.calls[0]?.[0];
      expect(inserted?.input_image_url).toBe(
        "https://cdn.example.com/source-stock.png"
      );
      expect(inserted?.source_image_stock_id).toBe(sourceImageStockId);
    });

    test("postGenerateAsyncRoute_ストック画像未検出の場合_404を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.findSourceImageStock.mockResolvedValueOnce({
        data: null,
        error: { message: "not found" },
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: "11111111-1111-4111-8111-111111111111",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(404);
      expect(body.error).toBe("ストック画像が見つかりません");
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("postGenerateAsyncRoute_ストック画像取得例外の場合_500を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.findSourceImageStock.mockRejectedValueOnce(
        new Error("stock lookup failed")
      );
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: "11111111-1111-4111-8111-111111111111",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe("ストック画像の取得に失敗しました");
    });
  });

  describe("GASYNC-005 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_元画像サイズ超過の場合_400を返してアップロードしない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const oversizedBase64 = "A".repeat(13_981_015);
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageBase64: oversizedBase64,
        sourceImageMimeType: "image/png",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(400);
      expect(body.error).toBe(
        "画像サイズが大きすぎます。10MB以下の画像に圧縮して再試行してください。"
      );
      expect(jobRepository.uploadSourceImage).not.toHaveBeenCalled();
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-006 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_HEIC変換失敗の場合_400を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      convertHeicBase64ToJpegMock.mockRejectedValueOnce(
        new Error("broken heic")
      );
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageBase64: Buffer.from("heic-bytes").toString("base64"),
        sourceImageMimeType: "image/heic",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(400);
      expect(body.error).toBe("HEIC画像の変換に失敗しました");
      expect(jobRepository.uploadSourceImage).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-007 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_元画像アップロード失敗の場合_500でジョブ作成しない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.uploadSourceImage.mockResolvedValueOnce({
        data: null,
        error: { message: "upload failed" },
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageBase64: Buffer.from("image-bytes").toString("base64"),
        sourceImageMimeType: "image/png",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe(
        "元画像のアップロードに失敗しました。もう一度お試しください。"
      );
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("postGenerateAsyncRoute_元画像処理例外の場合_500でジョブ作成しない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.uploadSourceImage.mockResolvedValueOnce({
        data: { path: "temp/user-123/source.png" },
        error: null,
      });
      jobRepository.getSourceImagePublicUrl.mockImplementationOnce(() => {
        throw new Error("public url failure");
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageBase64: Buffer.from("image-bytes").toString("base64"),
        sourceImageMimeType: "image/png",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe(
        "元画像の処理中にエラーが発生しました。もう一度お試しください。"
      );
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-008 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_残高取得失敗の場合_500を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.getUserCreditBalance.mockResolvedValueOnce({
        data: null,
        error: { message: "credit lookup failed" },
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe("ペルコイン残高の取得に失敗しました");
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-009 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_残高不足の場合_必要量付きメッセージで400を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.getUserCreditBalance.mockResolvedValueOnce({
        data: { balance: 5 },
        error: null,
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(400);
      expect(body.error).toBe(
        "ペルコイン残高が不足しています。生成には10ペルコイン必要ですが、現在の残高は5ペルコインです。"
      );
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-010 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_ジョブ作成失敗の場合_500でキュー送信しない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.createImageJob.mockResolvedValueOnce({
        data: null,
        error: { message: "insert failed" },
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe("ジョブの作成に失敗しました");
      expect(jobRepository.sendImageJobQueueMessage).not.toHaveBeenCalled();
    });
  });

  describe("GASYNC-011 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_キュー送信失敗の場合_warning付き202を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      jobRepository.createImageJob.mockResolvedValueOnce({
        data: { id: "job-202", status: "queued" },
        error: null,
      });
      jobRepository.sendImageJobQueueMessage.mockResolvedValueOnce({
        error: { message: "queue down" },
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
        invokeImageWorkerFn,
        supabaseUrl: "https://example.supabase.co",
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(202);
      expect(body).toEqual({
        jobId: "job-202",
        status: "queued",
        warning:
          "ジョブは作成されましたが、処理の開始が遅延する可能性があります。数秒後に再確認してください。",
      });
      expect(invokeImageWorkerFn).toHaveBeenCalledWith(
        "https://example.supabase.co/functions/v1/image-gen-worker"
      );
    });
  });

  describe("GASYNC-012 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_SupabaseUrlありの場合_レスポンスをブロックせずWorkerを呼び出す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
        invokeImageWorkerFn,
        supabaseUrl: "https://example.supabase.co",
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(body).toEqual({
        jobId: "job-001",
        status: "queued",
      });
      expect(invokeImageWorkerFn).toHaveBeenCalledWith(
        "https://example.supabase.co/functions/v1/image-gen-worker"
      );
    });

    test("postGenerateAsyncRoute_Worker呼び出し失敗の場合_メインレスポンスを維持する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const fetchMock = jest.fn(() => {
        throw new Error("worker unavailable");
      }) as unknown as typeof fetch;
      global.fetch = fetchMock;
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
        supabaseUrl: "https://example.supabase.co",
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(body).toEqual({
        jobId: "job-001",
        status: "queued",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("GASYNC-013 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_実行時例外の場合_500で汎用エラーを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      getUserFn.mockRejectedValueOnce(new Error("auth backend down"));
      const request = createRequest({ prompt: "linen jacket" });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe("画像生成ジョブの作成に失敗しました");
    });

    test("postGenerateAsyncRoute_Error以外がthrowされた場合_500で汎用エラーを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      getUserFn.mockRejectedValueOnce("unexpected throw");
      const request = createRequest({ prompt: "linen jacket" });

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe("画像生成ジョブの作成に失敗しました");
    });
  });

  describe("GASYNC-014 POST", () => {
    test("POST_リクエスト受領時_postGenerateAsyncRouteへ委譲する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      // Spec: GASYNC-014
      const request = createRequest({ prompt: "delegate-check" });
      const delegatedResponse = new Response(
        JSON.stringify({ delegated: true }),
        {
          status: 209,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const delegateSpy = jest.spyOn(
        generateAsyncRouteHandlers,
        "postGenerateAsyncRoute"
      );
      delegateSpy.mockResolvedValueOnce(delegatedResponse);

      // ============================================================
      // Act
      // ============================================================
      const response = await POST(request);

      // ============================================================
      // Assert
      // ============================================================
      expect(delegateSpy).toHaveBeenCalledTimes(1);
      expect(delegateSpy).toHaveBeenCalledWith(request);
      expect(response).toBe(delegatedResponse);
      delegateSpy.mockRestore();
    });
  });
});

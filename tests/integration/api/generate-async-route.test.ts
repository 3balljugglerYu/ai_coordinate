/** @jest-environment node */

jest.mock("@/features/generation/lib/heic-converter", () => {
  const actual = jest.requireActual("@/features/generation/lib/heic-converter");
  return {
    ...actual,
    convertHeicBase64ToJpeg: jest.fn(),
  };
});

jest.mock("@/features/generation/lib/model-config", () => {
  const actual = jest.requireActual("@/features/generation/lib/model-config");
  return {
    ...actual,
    GEMINI_GENERATION_ENABLED: true,
    isModelAvailableForGeneration: jest.fn((model?: string | null) =>
      typeof model === "string"
    ),
  };
});

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

// framingMode (free_pose) の admin viewer ゲートをテストごとに制御する
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isAdminViewer: jest.fn(() => false),
}));

jest.mock("@/features/inspire/lib/repository", () => ({
  getStyleTemplateById: jest.fn(),
}));

// Creator Looks 生成モードのガード判定をテストごとに制御する
jest.mock("@/lib/auth/creator-looks", () => ({
  isCreatorLooksEnabledForUser: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("@/features/inspire/lib/creator-looks-two-stage", () => ({
  ...jest.requireActual("@/features/inspire/lib/creator-looks-two-stage"),
  getCreatorLooksTwoStageVisibility: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/generate-async/route";
import {
  generateAsyncRouteHandlers,
  postGenerateAsyncRoute,
} from "@/app/api/generate-async/handler";
import type { AsyncGenerationJobRepository } from "@/features/generation/lib/async-generation-job-repository";
import { convertHeicBase64ToJpeg } from "@/features/generation/lib/heic-converter";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/features/generation/lib/prompt-validation";
import {
  getStyleTemplateById,
  type UserStyleTemplateRow,
} from "@/features/inspire/lib/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminViewer } from "@/lib/env";
import { isCreatorLooksEnabledForUser } from "@/lib/auth/creator-looks";
import { getCreatorLooksTwoStageVisibility } from "@/features/inspire/lib/creator-looks-two-stage";

const isAdminViewerMock = isAdminViewer as jest.MockedFunction<
  typeof isAdminViewer
>;
const isCreatorLooksEnabledForUserMock =
  isCreatorLooksEnabledForUser as jest.MockedFunction<
    typeof isCreatorLooksEnabledForUser
  >;
const getCreatorLooksTwoStageVisibilityMock =
  getCreatorLooksTwoStageVisibility as jest.MockedFunction<
    typeof getCreatorLooksTwoStageVisibility
  >;

type JsonRecord = Record<string, unknown>;
const VALID_SOURCE_IMAGE_STOCK_ID = "11111111-1111-4111-8111-111111111111";
const VALID_STYLE_TEMPLATE_ID = "22222222-2222-4222-8222-222222222222";
const VISIBLE_STYLE_TEMPLATE: UserStyleTemplateRow = {
  id: VALID_STYLE_TEMPLATE_ID,
  submitted_by_user_id: "template-owner-123",
  image_url: "https://cdn.example.com/style-template.png",
  storage_path: "style-templates/visible-template.png",
  alt: "visible style template",
  moderation_status: "visible",
  moderation_reason: null,
  moderation_updated_at: null,
  moderation_approved_at: "2026-01-01T00:00:00.000Z",
  moderation_decided_by: "admin-123",
  copyright_consent_at: "2026-01-01T00:00:00.000Z",
  preview_openai_image_url: null,
  preview_gemini_image_url: null,
  preview_generated_at: null,
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function createRequest(body: unknown): NextRequest {
  const request = new Request("http://localhost/api/generate-async", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "accept-language": "ja",
      // Phase 4: ensureSameOrigin を pass するために Origin/Host を一致させる
      origin: "http://localhost",
      host: "localhost",
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
    findGeneratedImage: jest.fn(),
    uploadSourceImage: jest.fn(),
    getSourceImagePublicUrl: jest.fn(),
    getUserCreditBalance: jest.fn(),
    getUserSubscriptionPlan: jest.fn(),
    createImageJob: jest.fn(),
    markImageJobFailed: jest.fn(),
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
  let getStyleTemplateByIdMock: jest.MockedFunction<
    typeof getStyleTemplateById
  >;
  let createAdminClientMock: jest.MockedFunction<typeof createAdminClient>;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
    isAdminViewerMock.mockReset();
    isAdminViewerMock.mockReturnValue(false);
    jobRepository = createAsyncGenerationJobRepositoryMock();
    invokeImageWorkerFn = jest.fn();
    createAdminClientMock = createAdminClient as jest.MockedFunction<
      typeof createAdminClient
    >;
    getStyleTemplateByIdMock =
      getStyleTemplateById as jest.MockedFunction<typeof getStyleTemplateById>;
    createAdminClientMock.mockReset();
    createAdminClientMock.mockReturnValue(
      {} as ReturnType<typeof createAdminClient>
    );
    getStyleTemplateByIdMock.mockReset();
    getStyleTemplateByIdMock.mockResolvedValue({
      data: VISIBLE_STYLE_TEMPLATE,
      error: null,
    });

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
    jobRepository.getUserSubscriptionPlan.mockResolvedValue({
      data: { subscription_plan: "standard" },
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
        acceptedImageCount: 1,
        batchMode: "openai_single_job",
      });
      expect(jobRepository.createImageJob).toHaveBeenCalledTimes(1);
      expect(jobRepository.createImageJob).toHaveBeenCalledWith({
        user_id: "user-123",
        prompt_text: "linen jacket",
        input_image_url: "https://cdn.example.com/stock.png",
        source_image_stock_id: VALID_SOURCE_IMAGE_STOCK_ID,
        source_image_type: "illustration",
        generation_type: "coordinate",
        model: "gpt-image-2-low-1k",
        background_mode: "keep",
        status: "queued",
        processing_stage: "queued",
        requested_image_count: 1,
        attempts: 0,
        // inspire 列は非 inspire 経路では NULL（Phase 1 マイグレ + handler 拡張）
        style_template_id: null,
        style_reference_image_url: null,
        override_outfit: null,
        override_angle: null,
        override_pose: null,
        override_background: null,
      });
      expect(jobRepository.sendImageJobQueueMessage).toHaveBeenCalledWith(
        "job-001"
      );
      expect(invokeImageWorkerFn).toHaveBeenCalledWith(
        "https://example.supabase.co/functions/v1/image-gen-worker"
      );
    });

    test.each([
      {
        label: "overrides未指定",
        requestOverrides: undefined,
        expectedOverrides: {
          override_outfit: true,
          override_angle: true,
          override_pose: true,
          override_background: true,
        },
      },
      {
        label: "overrides明示",
        requestOverrides: {
          outfit: false,
          angle: true,
          pose: false,
          background: true,
        },
        expectedOverrides: {
          override_outfit: false,
          override_angle: true,
          override_pose: false,
          override_background: true,
        },
      },
    ])(
      "postGenerateAsyncRoute_inspireで$labelの場合_override列を保存する",
      async ({ requestOverrides, expectedOverrides }) => {
        const response = await postGenerateAsyncRoute(
          createRequest({
            prompt: "apply style template",
            sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
            generationType: "inspire",
            styleTemplateId: VALID_STYLE_TEMPLATE_ID,
            model: "gpt-image-2-low-1k",
            ...(requestOverrides ? { overrides: requestOverrides } : {}),
          }),
          {
            getUserFn,
            jobRepository,
            invokeImageWorkerFn,
            supabaseUrl: "https://example.supabase.co",
          }
        );
        const body = await readJson(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({
          jobId: "job-001",
          status: "queued",
          acceptedImageCount: 1,
          batchMode: "openai_single_job",
        });
        expect(getStyleTemplateByIdMock).toHaveBeenCalledWith(
          expect.anything(),
          VALID_STYLE_TEMPLATE_ID
        );
        expect(jobRepository.createImageJob).toHaveBeenCalledWith(
          expect.objectContaining({
            generation_type: "inspire",
            style_template_id: VALID_STYLE_TEMPLATE_ID,
            style_reference_image_url: "style-templates/visible-template.png",
            ...expectedOverrides,
          })
        );
      }
    );
  });

  describe("Creator Looks 生成モード", () => {
    const CREATOR_LOOKS_TEMPLATE = {
      ...VISIBLE_STYLE_TEMPLATE,
      is_creator_looks: true,
    };

    function callCreatorLooks(creatorLooksMode: string) {
      return postGenerateAsyncRoute(
        createRequest({
          prompt: "creator-looks",
          sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
          generationType: "inspire",
          styleTemplateId: VALID_STYLE_TEMPLATE_ID,
          model: "gpt-image-2-low-1k", // 10 percoin
          creatorLooksMode,
        }),
        {
          getUserFn,
          jobRepository,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        }
      );
    }

    beforeEach(() => {
      getStyleTemplateByIdMock.mockResolvedValue({
        data: CREATOR_LOOKS_TEMPLATE,
        error: null,
      });
      isCreatorLooksEnabledForUserMock.mockReset();
      isCreatorLooksEnabledForUserMock.mockResolvedValue(true);
      getCreatorLooksTwoStageVisibilityMock.mockReset();
      getCreatorLooksTwoStageVisibilityMock.mockResolvedValue("public");

      // Creator Looks 投稿は cool-down(image_jobs) と hidden_prompt(secrets) を
      // admin client で参照する。cool-down=0件 / hidden_prompt=準備済み を返す。
      const imageJobs = {
        select() {
          return imageJobs;
        },
        eq() {
          return imageJobs;
        },
        gte() {
          return Promise.resolve({ count: 0, error: null });
        },
      };
      const secrets = {
        select() {
          return secrets;
        },
        eq() {
          return secrets;
        },
        maybeSingle() {
          return Promise.resolve({
            data: { template_id: VALID_STYLE_TEMPLATE_ID },
            error: null,
          });
        },
      };
      createAdminClientMock.mockReturnValue({
        from: (table: string) => (table === "image_jobs" ? imageJobs : secrets),
      } as unknown as ReturnType<typeof createAdminClient>);
    });

    test("background_only は override_outfit=false/background=true で1段保存する", async () => {
      const response = await callCreatorLooks("background_only");
      expect(response.status).toBe(200);
      expect(jobRepository.createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          override_outfit: false,
          override_background: true,
          generation_metadata: expect.objectContaining({
            creatorLooksMode: "background_only",
            creatorLooksMaxStages: 1,
          }),
        })
      );
    });

    test("outfit_and_background は公開時 override両true・2段・metadataを保存する", async () => {
      const response = await callCreatorLooks("outfit_and_background");
      expect(response.status).toBe(200);
      expect(jobRepository.createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          override_outfit: true,
          override_background: true,
          generation_metadata: expect.objectContaining({
            creatorLooksMode: "outfit_and_background",
            creatorLooksMaxStages: 2,
          }),
        })
      );
    });

    test("outfit_and_background は admin_only かつ非adminなら403で拒否する", async () => {
      getCreatorLooksTwoStageVisibilityMock.mockResolvedValue("admin_only");
      isAdminViewerMock.mockReturnValue(false);
      const response = await callCreatorLooks("outfit_and_background");
      expect(response.status).toBe(403);
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("outfit_and_background は admin_only でも admin なら許可する", async () => {
      getCreatorLooksTwoStageVisibilityMock.mockResolvedValue("admin_only");
      isAdminViewerMock.mockReturnValue(true);
      const response = await callCreatorLooks("outfit_and_background");
      expect(response.status).toBe(200);
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
        acceptedImageCount: 1,
        batchMode: "single_job",
      });
      expect(jobRepository.createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.1-flash-image-preview-512",
          requested_image_count: 1,
        })
      );
    });

    test("postGenerateAsyncRoute_OpenAIでcount指定の場合_1ジョブにrequested_image_countを保存する", async () => {
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
        model: "gpt-image-2-low-1k",
        count: 4,
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
        acceptedImageCount: 4,
        batchMode: "openai_single_job",
      });
      expect(jobRepository.getUserSubscriptionPlan).toHaveBeenCalledWith(
        "user-123"
      );
      expect(jobRepository.createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-image-2-low-1k",
          requested_image_count: 4,
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
      // 注: schema 改修後 (sourceImageStockId / sourceImageGeneratedId /
      // sourceImageBase64 を排他化) は同時送信が 400 になるため、stockId のみ
      // 指定する。uploadSourceImage が呼ばれないことは引き続き検証する。
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageStockId,
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

    test("postGenerateAsyncRoute_sourceImageGeneratedId指定の場合_生成済み画像URLを再利用しアップロードしない", async () => {
      // Arrange
      const sourceImageGeneratedId = "22222222-2222-4222-8222-222222222222";
      jobRepository.findGeneratedImage.mockResolvedValueOnce({
        data: {
          id: sourceImageGeneratedId,
          image_url: "https://cdn.example.com/generated-source.png",
        },
        error: null,
      });
      const request = createRequest({
        prompt: "linen jacket",
        sourceImageGeneratedId,
      });

      // Act
      const response = await postGenerateAsyncRoute(request, {
        getUserFn,
        jobRepository,
      });
      const body = await readJson(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.jobId).toBe("job-001");
      expect(jobRepository.findGeneratedImage).toHaveBeenCalledWith(
        sourceImageGeneratedId,
        "user-123"
      );
      // generated 経由ではアップロード往復を行わない (パフォーマンス改善の意図)
      expect(jobRepository.uploadSourceImage).not.toHaveBeenCalled();

      const inserted = jobRepository.createImageJob.mock.calls[0]?.[0];
      expect(inserted?.input_image_url).toBe(
        "https://cdn.example.com/generated-source.png"
      );
      // generated 由来は stock_id を持たない (stock とは別経路)
      expect(inserted?.source_image_stock_id ?? null).toBeNull();
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
        acceptedImageCount: 1,
        batchMode: "openai_single_job",
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
        acceptedImageCount: 1,
        batchMode: "openai_single_job",
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
        acceptedImageCount: 1,
        batchMode: "openai_single_job",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("GASYNC-013 postGenerateAsyncRoute", () => {
    test("postGenerateAsyncRoute_実行時例外の場合_500で汎用エラーとrequestIdを返す", async () => {
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
      expect(body).toEqual({
        error: "画像生成ジョブの作成に失敗しました",
        errorCode: "GENERATION_ASYNC_FAILED",
        requestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        ),
      });
    });

    test("postGenerateAsyncRoute_Error以外がthrowされた場合_500で汎用エラーとrequestIdを返す", async () => {
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
      expect(body).toEqual({
        error: "画像生成ジョブの作成に失敗しました",
        errorCode: "GENERATION_ASYNC_FAILED",
        requestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        ),
      });
    });
  });

  describe("GASYNC-014 POST", () => {
    test("POST_リクエスト受領時_postGenerateAsyncRouteへ委譲する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      // Spec: GASYNC-014
      const request = createRequest({ prompt: "delegate-check" });
      const delegatedResponse =
        new Response(JSON.stringify({ delegated: true }), {
          status: 209,
          headers: {
            "Content-Type": "application/json",
          },
        }) as Awaited<ReturnType<typeof postGenerateAsyncRoute>>;
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

  describe("framingMode (admin viewer 限定先行公開)", () => {
    const dependencies = () => ({
      getUserFn,
      jobRepository,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });

    function buildBody(extra: Record<string, unknown> = {}): JsonRecord {
      return {
        prompt: "linen jacket",
        sourceImageStockId: VALID_SOURCE_IMAGE_STOCK_ID,
        ...extra,
      };
    }

    test("非 admin の free_pose は 400 GENERATION_FRAMING_MODE_NOT_ALLOWED", async () => {
      const response = await postGenerateAsyncRoute(
        createRequest(buildBody({ framingMode: "free_pose" })),
        dependencies()
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.errorCode).toBe("GENERATION_FRAMING_MODE_NOT_ALLOWED");
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("未知の framingMode 値は schema で 400 になる", async () => {
      const response = await postGenerateAsyncRoute(
        createRequest(buildBody({ framingMode: "totally_free" })),
        dependencies()
      );

      expect(response.status).toBe(400);
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("coordinate 以外 (inspire) への framingMode 指定は 400 になる", async () => {
      isAdminViewerMock.mockReturnValue(true);
      const response = await postGenerateAsyncRoute(
        createRequest(
          buildBody({
            generationType: "inspire",
            styleTemplateId: VALID_STYLE_TEMPLATE_ID,
            framingMode: "free_pose",
          })
        ),
        dependencies()
      );

      expect(response.status).toBe(400);
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("admin の free_pose は generation_metadata.framingMode 付きでジョブ作成される", async () => {
      isAdminViewerMock.mockReturnValue(true);

      const response = await postGenerateAsyncRoute(
        createRequest(buildBody({ framingMode: "free_pose" })),
        dependencies()
      );

      expect(response.status).toBe(200);
      const jobData = jobRepository.createImageJob.mock.calls[0][0];
      expect(jobData.generation_metadata).toEqual({
        framingMode: "free_pose",
      });
      // prompt_text は raw のまま (free_pose の合成は worker の buildPrompt が行う)
      expect(jobData.prompt_text).toBe("linen jacket");
    });

    test("非 admin の ai_pose も 400 GENERATION_FRAMING_MODE_NOT_ALLOWED", async () => {
      const response = await postGenerateAsyncRoute(
        createRequest(buildBody({ framingMode: "ai_pose" })),
        dependencies()
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.errorCode).toBe("GENERATION_FRAMING_MODE_NOT_ALLOWED");
    });

    test("admin の ai_pose は generation_metadata.framingMode=ai_pose で記録される", async () => {
      isAdminViewerMock.mockReturnValue(true);

      const response = await postGenerateAsyncRoute(
        createRequest(buildBody({ framingMode: "ai_pose" })),
        dependencies()
      );

      expect(response.status).toBe(200);
      const jobData = jobRepository.createImageJob.mock.calls[0][0];
      expect(jobData.generation_metadata).toEqual({
        framingMode: "ai_pose",
      });
    });

    test("framingMode 省略時は generation_metadata を設定しない (後方互換)", async () => {
      const response = await postGenerateAsyncRoute(
        createRequest(buildBody()),
        dependencies()
      );

      expect(response.status).toBe(200);
      const jobData = jobRepository.createImageJob.mock.calls[0][0];
      expect("generation_metadata" in jobData).toBe(false);
    });

    test("locked の明示指定は admin 検証なしで通り metadata も設定しない", async () => {
      const response = await postGenerateAsyncRoute(
        createRequest(buildBody({ framingMode: "locked" })),
        dependencies()
      );

      expect(response.status).toBe(200);
      const jobData = jobRepository.createImageJob.mock.calls[0][0];
      expect("generation_metadata" in jobData).toBe(false);
    });
  });
});

/** @jest-environment node */

// resolveAllPromptTemplates が next/cache + admin client を使うため、
// test 環境では空 dict を返すスタブにする (pure builder が registry default に
// フォールバックするので既存挙動と等価)
jest.mock("@/features/generation-prompts/lib/resolve-templates", () => ({
  resolveAllPromptTemplates: jest.fn().mockResolvedValue({}),
  PROMPT_OVERRIDES_CACHE_TAG: "prompt-overrides",
}));
jest.mock("next/cache", () => ({
  cacheTag: jest.fn(),
  cacheLife: jest.fn(),
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("@/features/generation/lib/model-config", () => ({
  ...jest.requireActual("@/features/generation/lib/model-config"),
  GEMINI_GENERATION_ENABLED: true,
  isModelAvailableForGeneration: jest.fn((model?: string | null) =>
    typeof model === "string"
  ),
}));

import { NextRequest } from "next/server";
import { postStyleGenerateAsyncRoute } from "@/app/(app)/style/generate-async/handler";
import type { AsyncGenerationJobRepository } from "@/features/generation/lib/async-generation-job-repository";
import {
  STYLE_PROMPT_BASE_PREFIX,
  STYLE_PROMPT_ILLUSTRATION_SUFFIX,
  STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
  STYLE_PROMPT_REAL_SUFFIX,
} from "@/shared/generation/style-prompts";

type JsonRecord = Record<string, unknown>;
const STYLE_ID = "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1";
const TEST_COORDINATE_CATEGORY = {
  id: "category-coordinate",
  key: "coordinate",
  displayNameJa: "コーディネート",
  displayNameEn: "Coordinate",
  badgeColor: "#1f2937",
  badgeTextColor: "#ffffff",
  skipBasePrefix: false,
  outputAspectRatioMode: "source",
  userGuidanceJa: null,
  userGuidanceEn: null,
  showSourceImageTypeControl: true,
  showBackgroundChangeControl: true,
  showGenerationModelControl: true,
  showUserPromptInput: false,
  visibility: "public",
  isActive: true,
};

function buildStylePresetForGeneration(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: STYLE_ID,
    title: "PARIS CODE",
    thumbnailImageUrl: "https://example.com/style-presets/paris-code.webp",
    thumbnailWidth: 912,
    thumbnailHeight: 1173,
    hasBackgroundPrompt: false,
    stylingPrompt: "RAW PROMPT\nSECOND LINE",
    backgroundPrompt: null,
    status: "published",
    category: TEST_COORDINATE_CATEGORY,
    imageInputMode: "single",
    dualReferenceSource: "admin",
    referenceImageUrl: null,
    referenceImageStoragePath: null,
    ...overrides,
  };
}

function buildExpectedPrompt(params: {
  sourceImageType?: "illustration" | "real";
  backgroundInstruction: string;
  backgroundPrompt?: string | null;
}): string {
  const promptSuffix =
    params.sourceImageType === "real"
      ? STYLE_PROMPT_REAL_SUFFIX
      : STYLE_PROMPT_ILLUSTRATION_SUFFIX;

  const promptSections = [
    STYLE_PROMPT_BASE_PREFIX,
    promptSuffix,
    params.backgroundInstruction,
    "Styling Direction:\nRAW PROMPT\nSECOND LINE",
  ];

  if (params.backgroundPrompt) {
    promptSections.push(`Background Direction:\n${params.backgroundPrompt}`);
  }

  return promptSections.join("\n\n");
}

function createRequest(
  formData: FormData,
  options: { origin?: string | null; host?: string } = {}
): NextRequest {
  const headers = new Headers({
    "accept-language": "ja",
    host: options.host ?? "localhost",
  });
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? "http://localhost");
  }

  return new NextRequest("http://localhost/style/generate-async", {
    method: "POST",
    headers,
    body: formData,
  });
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function createUploadImage(
  options: { type?: string; size?: number; name?: string } = {}
): File {
  const {
    type = "image/png",
    size = 16,
    name = "upload-image.png",
  } = options;

  return new File([new Uint8Array(size)], name, { type });
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

describe("StyleGenerateAsyncRoute integration tests (Phase 5)", () => {
  let getUserFn: jest.Mock;
  let jobRepository: jest.Mocked<AsyncGenerationJobRepository>;
  let getPublishedStylePresetForGenerationFn: jest.Mock;
  let recordStyleUsageEventFn: jest.Mock<Promise<void>, [unknown]>;
  let invokeImageWorkerFn: jest.Mock;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
    jobRepository = createAsyncGenerationJobRepositoryMock();
    getPublishedStylePresetForGenerationFn = jest
      .fn()
      .mockResolvedValue(buildStylePresetForGeneration());
    recordStyleUsageEventFn = jest.fn().mockResolvedValue(undefined);
    invokeImageWorkerFn = jest.fn();

    jobRepository.uploadSourceImage.mockResolvedValue({
      data: { path: "temp/user-123/upload-image.png" },
      error: null,
    });
    jobRepository.getSourceImagePublicUrl.mockReturnValue(
      "https://cdn.example.com/temp/user-123/upload-image.png"
    );
    jobRepository.getUserCreditBalance.mockResolvedValue({
      data: { balance: 120 },
      error: null,
    });
    jobRepository.createImageJob.mockResolvedValue({
      data: { id: "style-job-001", status: "queued" },
      error: null,
    });
    jobRepository.markImageJobFailed.mockResolvedValue({
      error: null,
    });
    jobRepository.sendImageJobQueueMessage.mockResolvedValue({
      error: null,
    });
  });

  test("Same-Origin: Origin ヘッダーが無い mutation は 403 で拒否する", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(
      createRequest(formData, { origin: null }),
      {
        getUserFn,
        jobRepository,
        getPublishedStylePresetForGenerationFn,
        recordStyleUsageEventFn,
        invokeImageWorkerFn,
        supabaseUrl: "https://example.supabase.co",
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Missing Origin header" });
    expect(getUserFn).not.toHaveBeenCalled();
    expect(jobRepository.createImageJob).not.toHaveBeenCalled();
  });

  test("Same-Origin: cross-site Origin の mutation は 403 で拒否する", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(
      createRequest(formData, { origin: "https://evil.example" }),
      {
        getUserFn,
        jobRepository,
        getPublishedStylePresetForGenerationFn,
        recordStyleUsageEventFn,
        invokeImageWorkerFn,
        supabaseUrl: "https://example.supabase.co",
      }
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Cross-site request rejected" });
    expect(getUserFn).not.toHaveBeenCalled();
    expect(jobRepository.createImageJob).not.toHaveBeenCalled();
  });

  test("UCL-016: 認証ユーザーのジョブは常に billingMode=paid で作成される", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("sourceImageType", "illustration");
    formData.set("backgroundChange", "false");
    formData.set("model", "gemini-3.1-flash-image-preview-512");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: "style-job-001",
      status: "queued",
    });
    expect(jobRepository.getUserCreditBalance).toHaveBeenCalledWith("user-123");
    expect(jobRepository.createImageJob).toHaveBeenCalledWith({
      user_id: "user-123",
      prompt_text: buildExpectedPrompt({
        backgroundInstruction: STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
      }),
      input_image_url: "https://cdn.example.com/temp/user-123/upload-image.png",
      source_image_stock_id: null,
      source_image_type: "illustration",
      generation_type: "one_tap_style",
      model: "gemini-3.1-flash-image-preview-512",
      background_mode: "keep",
      generation_metadata: {
        oneTapStyle: {
          id: STYLE_ID,
          title: "PARIS CODE",
          thumbnailImageUrl:
            "https://example.com/style-presets/paris-code.webp",
          thumbnailWidth: 912,
          thumbnailHeight: 1173,
          hasBackgroundPrompt: false,
          outputAspectRatioMode: "source",
          billingMode: "paid",
        },
      },
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
      style_reference_image_url: null,
      style_reference_image_bucket: null,
      style_preset_category_key: "coordinate",
    });
    expect(jobRepository.sendImageJobQueueMessage).toHaveBeenCalledWith(
      "style-job-001"
    );
    expect(invokeImageWorkerFn).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/image-gen-worker"
    );
  });

  test("dual user_upload では uploadImage2 を temp 保存し、prompt にユーザー指定を結合する", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        imageInputMode: "dual",
        dualReferenceSource: "user_upload",
        category: {
          ...TEST_COORDINATE_CATEGORY,
          showUserPromptInput: true,
        },
      })
    );
    jobRepository.uploadSourceImage
      .mockResolvedValueOnce({
        data: { path: "temp/user-123/source-image.png" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { path: "temp/user-123/reference-image-ref.png" },
        error: null,
      });
    jobRepository.getSourceImagePublicUrl.mockReturnValueOnce(
      "https://cdn.example.com/temp/user-123/source-image.png"
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set(
      "uploadImage2",
      createUploadImage({ name: "reference.png" })
    );
    formData.set("userPrompt", "髪色をピンクにして、丸い目にする");
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(response.status).toBe(200);
    expect(jobRepository.uploadSourceImage).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^temp\/user-123\/.+-ref\.png$/),
      expect.any(Buffer),
      "image/png"
    );
    const inserted = jobRepository.createImageJob.mock.calls[0]?.[0];
    expect(inserted?.style_reference_image_url).toBe(
      "temp/user-123/reference-image-ref.png"
    );
    expect(inserted?.style_reference_image_bucket).toBe("generated-images");
    expect(inserted?.prompt_text).toContain(
      "User Visual Preferences:\n髪色をピンクにして、丸い目にする"
    );
  });

  test("showUserPromptInput=false のカテゴリでは userPrompt を送られても無視する", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("userPrompt", "この指示は採用しない");
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(response.status).toBe(200);
    const inserted = jobRepository.createImageJob.mock.calls[0]?.[0];
    expect(inserted?.prompt_text).not.toContain("User Visual Preferences");
    expect(inserted?.prompt_text).not.toContain("この指示は採用しない");
  });

  test("カテゴリで非表示のstyleフォーム項目はサーバー側でも既定値に固定する", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce({
      ...buildStylePresetForGeneration({
        backgroundPrompt: "Soft spring city street with blossoms",
        hasBackgroundPrompt: true,
        category: {
          ...TEST_COORDINATE_CATEGORY,
          showSourceImageTypeControl: false,
          showBackgroundChangeControl: false,
          showGenerationModelControl: false,
        },
      }),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("sourceImageType", "real");
    formData.set("backgroundChange", "true");
    formData.set("model", "gemini-3.1-flash-image-preview-512");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(response.status).toBe(200);
    expect(jobRepository.createImageJob).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_text: buildExpectedPrompt({
          backgroundInstruction: STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
        }),
        source_image_type: "illustration",
        model: "gpt-image-2-low-1k",
        background_mode: "keep",
      }),
    );
  });

  test("運営限定カテゴリは非管理者のasync生成では使えない", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce({
      ...buildStylePresetForGeneration({
        category: {
          ...TEST_COORDINATE_CATEGORY,
          key: "chibi",
          displayNameJa: "ちびキャラ",
          displayNameEn: "Chibi",
          visibility: "admin_only",
        },
      }),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gemini-3.1-flash-image-preview-512");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("STYLE_INVALID_STYLE");
    expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    expect(invokeImageWorkerFn).not.toHaveBeenCalled();
  });

  test("Phase 5: 5回無料枠は完全廃止 (reservation 系 RPC を呼び出さない)", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(response.status).toBe(200);
    // この経路ではゲスト/認証双方の reserve_*_generate_attempt 系 RPC は呼ばれない。
    // dependencies 引数自体に存在しないため、テストは「存在しないこと」をシグネチャで保証。
    expect(jobRepository.createImageJob).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2-low-1k",
        generation_metadata: expect.objectContaining({
          oneTapStyle: expect.objectContaining({ billingMode: "paid" }),
        }),
      })
    );
  });

  test("UCL-007: 残高不足は 400 STYLE_INSUFFICIENT_PERCOIN_BALANCE", async () => {
    jobRepository.getUserCreditBalance.mockResolvedValueOnce({
      data: { balance: 5 },
      error: null,
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gemini-3.1-flash-image-preview-512"); // cost=10

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("STYLE_INSUFFICIENT_PERCOIN_BALANCE");
    expect(body.error).toBe(
      "残高が不足しています。10ペルコイン以上を用意してから続けてください。"
    );
    expect(jobRepository.createImageJob).not.toHaveBeenCalled();
  });

  test("Pro 1K (50) のときは 50 ペルコイン以上を要求する", async () => {
    jobRepository.getUserCreditBalance.mockResolvedValueOnce({
      data: { balance: 49 },
      error: null,
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gemini-3-pro-image-1k");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("STYLE_INSUFFICIENT_PERCOIN_BALANCE");
    expect(body.error).toMatch(/50ペルコイン/);
  });

  test("未送信 model は DEFAULT_GENERATION_MODEL (gpt-image-2-low-1k) として扱う", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    // model は意図的にセットしない

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(response.status).toBe(200);
    expect(jobRepository.createImageJob).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2-low-1k" })
    );
  });

  test("upload 失敗時は 500 STYLE_SOURCE_UPLOAD_FAILED (reservation がないので release も呼ばない)", async () => {
    jobRepository.uploadSourceImage.mockResolvedValueOnce({
      data: null,
      error: new Error("upload failed"),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("STYLE_SOURCE_UPLOAD_FAILED");
    expect(jobRepository.createImageJob).not.toHaveBeenCalled();
  });

  test("queue 失敗時は 500 STYLE_QUEUE_FAILED + ジョブを failed にマーク", async () => {
    jobRepository.sendImageJobQueueMessage.mockResolvedValueOnce({
      error: new Error("queue failed"),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gpt-image-2-low-1k");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("STYLE_QUEUE_FAILED");
    expect(jobRepository.markImageJobFailed).toHaveBeenCalledWith(
      "style-job-001",
      "Queue message dispatch failed."
    );
  });

  // Phase: 再アップロード省略のための sourceImageStockId / sourceImageGeneratedId 経路
  describe("sourceImageStockId / sourceImageGeneratedId 経路", () => {
    test("sourceImageStockId 指定時は stock を DB から取得し uploadSourceImage を呼ばない", async () => {
      jobRepository.findSourceImageStock.mockResolvedValueOnce({
        data: {
          id: "stock-1",
          image_url: "https://cdn.example.com/stocks/source.png",
        },
        error: null,
      });
      const formData = new FormData();
      formData.set("styleId", STYLE_ID);
      formData.set("sourceImageStockId", "stock-1");
      formData.set("sourceImageType", "real");
      formData.set("model", "gpt-image-2-low-1k");

      const response = await postStyleGenerateAsyncRoute(
        createRequest(formData),
        {
          getUserFn,
          jobRepository,
          getPublishedStylePresetForGenerationFn,
          recordStyleUsageEventFn,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        },
      );

      expect(response.status).toBe(200);
      expect(jobRepository.findSourceImageStock).toHaveBeenCalledWith(
        "stock-1",
        "user-123",
      );
      expect(jobRepository.uploadSourceImage).not.toHaveBeenCalled();
      const inserted = jobRepository.createImageJob.mock.calls[0]?.[0];
      expect(inserted?.input_image_url).toBe(
        "https://cdn.example.com/stocks/source.png",
      );
      expect(inserted?.source_image_stock_id).toBe("stock-1");
    });

    test("sourceImageGeneratedId 指定時は generated_images を取得し uploadSourceImage を呼ばない", async () => {
      jobRepository.findGeneratedImage.mockResolvedValueOnce({
        data: {
          id: "gen-7",
          image_url: "https://cdn.example.com/generated/gen-7.png",
        },
        error: null,
      });
      const formData = new FormData();
      formData.set("styleId", STYLE_ID);
      formData.set("sourceImageGeneratedId", "gen-7");
      formData.set("model", "gpt-image-2-low-1k");

      const response = await postStyleGenerateAsyncRoute(
        createRequest(formData),
        {
          getUserFn,
          jobRepository,
          getPublishedStylePresetForGenerationFn,
          recordStyleUsageEventFn,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        },
      );

      expect(response.status).toBe(200);
      expect(jobRepository.findGeneratedImage).toHaveBeenCalledWith(
        "gen-7",
        "user-123",
      );
      expect(jobRepository.uploadSourceImage).not.toHaveBeenCalled();
      const inserted = jobRepository.createImageJob.mock.calls[0]?.[0];
      expect(inserted?.input_image_url).toBe(
        "https://cdn.example.com/generated/gen-7.png",
      );
      // generated 経由は stock_id を持たない
      expect(inserted?.source_image_stock_id ?? null).toBeNull();
    });

    test("stock 未検出時は 404 STYLE_SOURCE_STOCK_NOT_FOUND", async () => {
      jobRepository.findSourceImageStock.mockResolvedValueOnce({
        data: null,
        error: new Error("not found"),
      });
      const formData = new FormData();
      formData.set("styleId", STYLE_ID);
      formData.set("sourceImageStockId", "missing-stock");
      formData.set("model", "gpt-image-2-low-1k");

      const response = await postStyleGenerateAsyncRoute(
        createRequest(formData),
        {
          getUserFn,
          jobRepository,
          getPublishedStylePresetForGenerationFn,
          recordStyleUsageEventFn,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        },
      );
      const body = await readJson(response);
      expect(response.status).toBe(404);
      expect(body.errorCode).toBe("STYLE_SOURCE_STOCK_NOT_FOUND");
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("generated 未検出時は 404 STYLE_SOURCE_GENERATED_NOT_FOUND", async () => {
      jobRepository.findGeneratedImage.mockResolvedValueOnce({
        data: null,
        error: new Error("not found"),
      });
      const formData = new FormData();
      formData.set("styleId", STYLE_ID);
      formData.set("sourceImageGeneratedId", "missing-gen");
      formData.set("model", "gpt-image-2-low-1k");

      const response = await postStyleGenerateAsyncRoute(
        createRequest(formData),
        {
          getUserFn,
          jobRepository,
          getPublishedStylePresetForGenerationFn,
          recordStyleUsageEventFn,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        },
      );
      const body = await readJson(response);
      expect(response.status).toBe(404);
      expect(body.errorCode).toBe("STYLE_SOURCE_GENERATED_NOT_FOUND");
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("stockId / generatedId / uploadImage を同時に送ると 400 で曖昧拒否", async () => {
      const formData = new FormData();
      formData.set("styleId", STYLE_ID);
      formData.set("uploadImage", createUploadImage());
      formData.set("sourceImageStockId", "stock-1");
      formData.set("model", "gpt-image-2-low-1k");

      const response = await postStyleGenerateAsyncRoute(
        createRequest(formData),
        {
          getUserFn,
          jobRepository,
          getPublishedStylePresetForGenerationFn,
          recordStyleUsageEventFn,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        },
      );
      const body = await readJson(response);
      expect(response.status).toBe(400);
      expect(body.errorCode).toBe("STYLE_AMBIGUOUS_SOURCE_IMAGE");
      expect(jobRepository.createImageJob).not.toHaveBeenCalled();
    });

    test("uploadImage も stockId も generatedId も無いと 400 STYLE_MISSING_UPLOAD_IMAGE", async () => {
      const formData = new FormData();
      formData.set("styleId", STYLE_ID);
      formData.set("model", "gpt-image-2-low-1k");

      const response = await postStyleGenerateAsyncRoute(
        createRequest(formData),
        {
          getUserFn,
          jobRepository,
          getPublishedStylePresetForGenerationFn,
          recordStyleUsageEventFn,
          invokeImageWorkerFn,
          supabaseUrl: "https://example.supabase.co",
        },
      );
      const body = await readJson(response);
      expect(response.status).toBe(400);
      expect(body.errorCode).toBe("STYLE_MISSING_UPLOAD_IMAGE");
    });
  });
});

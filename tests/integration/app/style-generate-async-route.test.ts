/** @jest-environment node */

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

function createRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/style/generate-async", {
    method: "POST",
    headers: {
      "accept-language": "ja",
    },
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
    getPublishedStylePresetForGenerationFn = jest.fn().mockResolvedValue({
      id: STYLE_ID,
      title: "PARIS CODE",
      thumbnailImageUrl: "https://example.com/style-presets/paris-code.webp",
      thumbnailWidth: 912,
      thumbnailHeight: 1173,
      hasBackgroundPrompt: false,
      stylingPrompt: "RAW PROMPT\nSECOND LINE",
      backgroundPrompt: null,
    });
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
          billingMode: "paid",
        },
      },
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
    });
    expect(jobRepository.sendImageJobQueueMessage).toHaveBeenCalledWith(
      "style-job-001"
    );
    expect(invokeImageWorkerFn).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/image-gen-worker"
    );
  });

  test("Phase 5: 5回無料枠は完全廃止 (reservation 系 RPC を呼び出さない)", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("model", "gpt-image-2-low");

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
        model: "gpt-image-2-low",
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

  test("未送信 model は DEFAULT_GENERATION_MODEL (gpt-image-2-low) として扱う", async () => {
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
      expect.objectContaining({ model: "gpt-image-2-low" })
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
    formData.set("model", "gpt-image-2-low");

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
    formData.set("model", "gpt-image-2-low");

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
});

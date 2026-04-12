/** @jest-environment node */

import { NextRequest } from "next/server";
import { postStyleGenerateAsyncRoute } from "@/app/(app)/style/generate-async/handler";
import type { AsyncGenerationJobRepository } from "@/features/generation/lib/async-generation-job-repository";
import type {
  StyleGenerateAttemptReservation,
  StyleGenerateRateLimitResult,
} from "@/features/style/lib/style-rate-limit";

type JsonRecord = Record<string, unknown>;
const STYLE_ID = "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1";
const STYLE_PROMPT_BASE_PREFIX = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. Strictly follow these steps:

1. Strict Filtering: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a part is not in the original frame, omit its description entirely.

2. Pose Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`.`;

function buildExpectedPrompt(params: {
  sourceImageType?: "illustration" | "real";
  backgroundInstruction: string;
  backgroundPrompt?: string | null;
}): string {
  const promptSuffix =
    params.sourceImageType === "real"
      ? "Generate a photorealistic result based on the uploaded photo. Preserve the original camera angle, framing, realistic lighting, and composition. Do not introduce painterly or illustrated rendering."
      : "Maintain the exact artistic style, brushwork, and original composition.";

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
    createImageJob: jest.fn(),
    markImageJobFailed: jest.fn(),
    sendImageJobQueueMessage: jest.fn(),
  };
}

describe("StyleGenerateAsyncRoute integration tests", () => {
  let getUserFn: jest.Mock;
  let jobRepository: jest.Mocked<AsyncGenerationJobRepository>;
  let getPublishedStylePresetForGenerationFn: jest.Mock;
  let recordStyleUsageEventFn: jest.Mock<Promise<void>, [unknown]>;
  let checkAndConsumeRateLimitFn: jest.Mock<
    Promise<StyleGenerateRateLimitResult>,
    [{ request: NextRequest; userId: string | null; styleId: string }]
  >;
  let releaseRateLimitAttemptFn: jest.Mock<
    Promise<boolean>,
    [
      {
        reservation: StyleGenerateAttemptReservation | null | undefined;
        reason:
          | "upload_failed"
          | "job_create_failed"
          | "queue_failed"
          | "timeout"
          | "upstream_error"
          | "no_image_generated"
          | "worker_failed"
          | "infra_error";
      },
    ]
  >;
  let attachReservationToJobFn: jest.Mock<
    Promise<boolean>,
    [
      {
        reservation: StyleGenerateAttemptReservation | null | undefined;
        jobId: string;
      },
    ]
  >;
  let invokeImageWorkerFn: jest.Mock;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
    jobRepository = createAsyncGenerationJobRepositoryMock();
    getPublishedStylePresetForGenerationFn = jest
      .fn()
      .mockResolvedValue({
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
    checkAndConsumeRateLimitFn = jest
      .fn()
      .mockResolvedValue({ allowed: true });
    releaseRateLimitAttemptFn = jest.fn().mockResolvedValue(true);
    attachReservationToJobFn = jest.fn().mockResolvedValue(true);
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

  test("postStyleGenerateAsyncRoute_認証済みユーザーはone_tap_styleジョブを作成する", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("sourceImageType", "illustration");
    formData.set("backgroundChange", "false");

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
      attachReservationToJobFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: "style-job-001",
      status: "queued",
    });
    expect(jobRepository.createImageJob).toHaveBeenCalledWith({
      user_id: "user-123",
      prompt_text: buildExpectedPrompt({
        backgroundInstruction:
          "Keep the entire original background unchanged as much as possible. Do not replace, redesign, or restyle the background.",
      }),
      input_image_url: "https://cdn.example.com/temp/user-123/upload-image.png",
      source_image_stock_id: null,
      source_image_type: "illustration",
      generation_type: "one_tap_style",
      model: "gemini-3.1-flash-image-preview-512",
      background_mode: "keep",
      background_change: false,
      generation_metadata: {
        oneTapStyle: {
          id: STYLE_ID,
          title: "PARIS CODE",
          thumbnailImageUrl:
            "https://example.com/style-presets/paris-code.webp",
          thumbnailWidth: 912,
          thumbnailHeight: 1173,
          hasBackgroundPrompt: false,
          billingMode: "free",
          reservedAttemptId: "attempt-auth-001",
        },
      },
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
    });
    expect(jobRepository.sendImageJobQueueMessage).toHaveBeenCalledWith(
      "style-job-001"
    );
    expect(attachReservationToJobFn).toHaveBeenCalledWith({
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
      jobId: "style-job-001",
    });
    expect(invokeImageWorkerFn).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/image-gen-worker"
    );
  });

  test("postStyleGenerateAsyncRoute_認証済み日次制限後はpaidジョブを作成する", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "authenticated_daily",
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
      attachReservationToJobFn,
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
    expect(jobRepository.createImageJob).toHaveBeenCalledWith(
      expect.objectContaining({
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
      })
    );
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateAsyncRoute_認証済み日次制限後に残高不足なら400を返す", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "authenticated_daily",
    });
    jobRepository.getUserCreditBalance.mockResolvedValueOnce({
      data: { balance: 5 },
      error: null,
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
      attachReservationToJobFn,
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

  test("postStyleGenerateAsyncRoute_upload失敗時_releaseして500を返す", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
    });
    jobRepository.uploadSourceImage.mockResolvedValueOnce({
      data: null,
      error: new Error("upload failed"),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
      attachReservationToJobFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("STYLE_SOURCE_UPLOAD_FAILED");
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
      reason: "upload_failed",
    });
    expect(jobRepository.createImageJob).not.toHaveBeenCalled();
  });

  test("postStyleGenerateAsyncRoute_queue失敗時_releaseしてjobをfailedにする", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
    });
    jobRepository.sendImageJobQueueMessage.mockResolvedValueOnce({
      error: new Error("queue failed"),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateAsyncRoute(createRequest(formData), {
      getUserFn,
      jobRepository,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
      attachReservationToJobFn,
      invokeImageWorkerFn,
      supabaseUrl: "https://example.supabase.co",
    });
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("STYLE_QUEUE_FAILED");
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
      reason: "queue_failed",
    });
    expect(jobRepository.markImageJobFailed).toHaveBeenCalledWith(
      "style-job-001",
      "Queue message dispatch failed."
    );
  });
});

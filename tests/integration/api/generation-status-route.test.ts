/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/generation-status/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function createRequest(url: string, locale: "ja" | "en" = "ja"): NextRequest {
  const request = new Request(url, {
    headers: { "accept-language": locale },
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function setupJobQuery(result: {
  data: {
    id: string;
    status: string;
    processing_stage: string | null;
    result_image_url: string | null;
    error_message: string | null;
    requested_image_count?: number;
    model?: string | null;
  } | null;
  error: { code?: string; message?: string } | null;
}, generatedImageId: string | null = null) {
  const single = jest.fn().mockResolvedValue(result);
  const secondEq = jest.fn().mockReturnValue({ single });
  const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
  const select = jest.fn().mockReturnValue({ eq: firstEq });
  const generatedByJobSecondOrder = jest.fn().mockResolvedValue({
    data: [],
    error: null,
  });
  const generatedByJobFirstOrder = jest.fn().mockReturnValue({
    order: generatedByJobSecondOrder,
  });
  const generatedByJobSecondEq = jest.fn().mockReturnValue({
    order: generatedByJobFirstOrder,
  });
  const generatedByJobFirstEq = jest.fn().mockReturnValue({
    eq: generatedByJobSecondEq,
  });
  const generatedMaybeSingle = jest.fn().mockResolvedValue({
    data: generatedImageId && result.data?.result_image_url
      ? { id: generatedImageId, image_url: result.data.result_image_url }
      : null,
    error: null,
  });
  const generatedLimit = jest.fn().mockReturnValue({
    maybeSingle: generatedMaybeSingle,
  });
  const generatedLegacyOrder = jest.fn().mockReturnValue({
    limit: generatedLimit,
  });
  const generatedLegacySecondEq = jest.fn().mockReturnValue({
    order: generatedLegacyOrder,
  });
  const generatedLegacyFirstEq = jest.fn().mockReturnValue({
    eq: generatedLegacySecondEq,
  });
  const generatedSelect = jest
    .fn()
    .mockReturnValueOnce({ eq: generatedByJobFirstEq })
    .mockReturnValueOnce({ eq: generatedLegacyFirstEq });
  const from = jest.fn().mockImplementation((table: string) => {
    if (table === "image_jobs") {
      return { select };
    }

    if (table === "generated_images") {
      return { select: generatedSelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  mockCreateClient.mockResolvedValue({ from } as never);
  return { from, firstEq, secondEq, single, generatedMaybeSingle };
}

describe("GET /api/generation-status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
  });

  test("GET_Geminiのinvalid argumentは汎用エラーへ正規化する", async () => {
    setupJobQuery({
      data: {
        id: "job-1",
        status: "failed",
        processing_stage: "failed",
        result_image_url: null,
        error_message: "Request contains an invalid argument.",
      },
      error: null,
    });

    const res = await GET(
      createRequest("http://localhost/api/generation-status?id=job-1", "ja")
    );
    const body = (await res.json()) as {
      id: string;
      status: string;
      processingStage: string | null;
      requestedImageCount: number;
      batchMode: string;
      previewImageUrl: string | null;
      resultImageUrl: string | null;
      resultImages: Array<{ id: string; url: string }>;
      errorMessage: string | null;
      generatedImageId: string | null;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "job-1",
      status: "failed",
      processingStage: "failed",
      requestedImageCount: 1,
      batchMode: "single_job",
      previewImageUrl: null,
      resultImageUrl: null,
      resultImages: [],
      errorMessage:
        "画像生成に失敗しました。しばらくしてから、もう一度お試しください。",
      generatedImageId: null,
    });
  });

  test("GET_想定外エラーはそのまま返す", async () => {
    setupJobQuery({
      data: {
        id: "job-2",
        status: "failed",
        processing_stage: "failed",
        result_image_url: null,
        error_message: "custom backend error",
      },
      error: null,
    });

    const res = await GET(
      createRequest("http://localhost/api/generation-status?id=job-2", "en")
    );
    const body = (await res.json()) as {
      errorMessage: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.errorMessage).toBe("custom backend error");
  });

  test("GET_processing中は previewImageUrl のみ返す", async () => {
    setupJobQuery({
      data: {
        id: "job-3",
        status: "processing",
        processing_stage: "persisting",
        result_image_url: "https://cdn.example.com/generated.png",
        error_message: null,
      },
      error: null,
    });

    const res = await GET(
      createRequest("http://localhost/api/generation-status?id=job-3", "ja")
    );
    const body = (await res.json()) as {
      id: string;
      status: string;
      processingStage: string | null;
      requestedImageCount: number;
      batchMode: string;
      previewImageUrl: string | null;
      resultImageUrl: string | null;
      resultImages: Array<{ id: string; url: string }>;
      errorMessage: string | null;
      generatedImageId: string | null;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "job-3",
      status: "processing",
      processingStage: "persisting",
      requestedImageCount: 1,
      batchMode: "single_job",
      previewImageUrl: "https://cdn.example.com/generated.png",
      resultImageUrl: null,
      resultImages: [],
      errorMessage: null,
      generatedImageId: null,
    });
  });

  test("GET_succeeded後は resultImageUrl のみ返す", async () => {
    setupJobQuery({
      data: {
        id: "job-4",
        status: "succeeded",
        processing_stage: "completed",
        result_image_url: "https://cdn.example.com/generated.png",
        error_message: null,
      },
      error: null,
    }, "generated-image-123");

    const res = await GET(
      createRequest("http://localhost/api/generation-status?id=job-4", "ja")
    );
    const body = (await res.json()) as {
      id: string;
      status: string;
      processingStage: string | null;
      requestedImageCount: number;
      batchMode: string;
      previewImageUrl: string | null;
      resultImageUrl: string | null;
      resultImages: Array<{ id: string; url: string }>;
      errorMessage: string | null;
      generatedImageId: string | null;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "job-4",
      status: "succeeded",
      processingStage: "completed",
      requestedImageCount: 1,
      batchMode: "single_job",
      previewImageUrl: null,
      resultImageUrl: "https://cdn.example.com/generated.png",
      resultImages: [
        {
          id: "generated-image-123",
          url: "https://cdn.example.com/generated.png",
        },
      ],
      errorMessage: null,
      generatedImageId: "generated-image-123",
    });
  });
});

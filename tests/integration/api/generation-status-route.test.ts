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
  } | null;
  error: { code?: string; message?: string } | null;
}) {
  const single = jest.fn().mockResolvedValue(result);
  const secondEq = jest.fn().mockReturnValue({ single });
  const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
  const select = jest.fn().mockReturnValue({ eq: firstEq });
  const from = jest.fn().mockImplementation((table: string) => {
    expect(table).toBe("image_jobs");
    return { select };
  });

  mockCreateClient.mockResolvedValue({ from } as never);
  return { from, firstEq, secondEq, single };
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
      previewImageUrl: string | null;
      resultImageUrl: string | null;
      errorMessage: string | null;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "job-1",
      status: "failed",
      processingStage: "failed",
      previewImageUrl: null,
      resultImageUrl: null,
      errorMessage:
        "画像生成に失敗しました。しばらくしてから、もう一度お試しください。",
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
      previewImageUrl: string | null;
      resultImageUrl: string | null;
      errorMessage: string | null;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "job-3",
      status: "processing",
      processingStage: "persisting",
      previewImageUrl: "https://cdn.example.com/generated.png",
      resultImageUrl: null,
      errorMessage: null,
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
    });

    const res = await GET(
      createRequest("http://localhost/api/generation-status?id=job-4", "ja")
    );
    const body = (await res.json()) as {
      id: string;
      status: string;
      processingStage: string | null;
      previewImageUrl: string | null;
      resultImageUrl: string | null;
      errorMessage: string | null;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "job-4",
      status: "succeeded",
      processingStage: "completed",
      previewImageUrl: null,
      resultImageUrl: "https://cdn.example.com/generated.png",
      errorMessage: null,
    });
  });
});

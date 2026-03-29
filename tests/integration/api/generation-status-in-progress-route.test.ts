/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/generation-status/in-progress/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function createRequest(
  url: string,
  locale: "ja" | "en" = "ja"
): NextRequest {
  const request = new Request(url, {
    headers: { "accept-language": locale },
  });

  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

describe("GET /api/generation-status/in-progress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
  });

  test("未完了と最近完了ジョブに processingStage を含めて返す", async () => {
    const activeOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: "job-queued",
          status: "queued",
          processing_stage: "queued",
          created_at: "2026-03-27T10:00:00.000Z",
        },
        {
          id: "job-processing",
          status: "processing",
          processing_stage: "generating",
          created_at: "2026-03-27T10:01:00.000Z",
        },
      ],
      error: null,
    });
    const recentLimit = jest.fn().mockResolvedValue({
      data: [
        {
          id: "job-succeeded",
          status: "succeeded",
          processing_stage: "completed",
          created_at: "2026-03-27T10:02:00.000Z",
        },
      ],
      error: null,
    });
    const recentOrder = jest.fn().mockReturnValue({ limit: recentLimit });
    const recentGte = jest.fn().mockReturnValue({ order: recentOrder });
    const recentIn = jest.fn().mockReturnValue({ gte: recentGte });
    const recentEq = jest.fn().mockReturnValue({ in: recentIn });
    const activeIn = jest.fn().mockReturnValue({ order: activeOrder });
    const activeEq = jest.fn().mockReturnValue({ in: activeIn });
    const select = jest
      .fn()
      .mockReturnValueOnce({ eq: activeEq })
      .mockReturnValueOnce({ eq: recentEq });
    const from = jest.fn().mockReturnValue({ select });

    mockCreateClient.mockResolvedValue({ from } as never);

    const response = await GET(
      createRequest(
        "http://localhost/api/generation-status/in-progress?includeRecent=true"
      )
    );
    const body = (await response.json()) as {
      jobs: Array<{
        id: string;
        status: string;
        processingStage: string | null;
        createdAt: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.jobs).toEqual([
      {
        id: "job-succeeded",
        status: "succeeded",
        processingStage: "completed",
        createdAt: "2026-03-27T10:02:00.000Z",
      },
      {
        id: "job-processing",
        status: "processing",
        processingStage: "generating",
        createdAt: "2026-03-27T10:01:00.000Z",
      },
      {
        id: "job-queued",
        status: "queued",
        processingStage: "queued",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
    ]);
  });
});

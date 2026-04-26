/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  },
}));

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/generate-async/route";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type JsonRecord = Record<string, unknown>;
const SAMPLE_SOURCE_IMAGE_BASE64 = Buffer.from("image-bytes").toString("base64");

type QueryResult<T> = {
  data: T | null;
  error: unknown | null;
};

type SupabaseMockOptions = {
  creditBalance?: number;
  jobResult?: QueryResult<{ id: string; status: string }>;
  uploadResult?: QueryResult<{ path: string }>;
  publicUrl?: string;
  rpcError?: unknown | null;
};

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

function createQueryBuilder<T>(singleResult: QueryResult<T>) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    single: jest.fn(async () => singleResult),
  };

  return builder;
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const stockBuilder = createQueryBuilder<{ id: string; image_url: string }>({
    data: null,
    error: { message: "stock not found" },
  });
  const creditsBuilder = createQueryBuilder<{ balance: number }>({
    data: { balance: options.creditBalance ?? 100 },
    error: null,
  });
  const jobsBuilder = createQueryBuilder<{ id: string; status: string }>(
    options.jobResult ?? {
      data: { id: "job-001", status: "queued" },
      error: null,
    }
  );

  const from = jest.fn((table: string) => {
    if (table === "source_image_stocks") {
      return stockBuilder;
    }
    if (table === "user_credits") {
      return creditsBuilder;
    }
    if (table === "image_jobs") {
      return jobsBuilder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const upload = jest.fn().mockResolvedValue(
    options.uploadResult ?? {
      data: { path: "temp/user-123/mock-upload.png" },
      error: null,
    }
  );
  const getPublicUrl = jest.fn(() => ({
    data: {
      publicUrl: options.publicUrl ?? "https://cdn.example.com/mock-upload.png",
    },
  }));
  const storageFrom = jest.fn(() => ({
    upload,
    getPublicUrl,
  }));

  const rpc = jest.fn().mockResolvedValue({
    error: options.rpcError ?? null,
  });

  const client = {
    from,
    storage: { from: storageFrom },
    rpc,
  };

  return {
    client,
    from,
    upload,
    getPublicUrl,
    rpc,
    stockBuilder,
    creditsBuilder,
    jobsBuilder,
  };
}

describe("Characterization: GenerateAsyncRoute POST", () => {
  const getUserMock = getUser as jest.MockedFunction<typeof getUser>;
  const createAdminClientMock = createAdminClient as jest.MockedFunction<
    typeof createAdminClient
  >;

  let originalFetch: typeof global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    getUserMock.mockReset();
    createAdminClientMock.mockReset();

    getUserMock.mockResolvedValue({
      id: "user-123",
    } as unknown as Awaited<ReturnType<typeof getUser>>);

    originalFetch = global.fetch;
    fetchMock = jest.fn().mockResolvedValue(
      new Response(null, { status: 202 })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    jest.spyOn(console, "error").mockImplementation(() => {
      // keep test output deterministic
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("CHAR-GENERATE-ASYNC-001: unauthenticated request returns 401", async () => {
    getUserMock.mockResolvedValue(null);

    const response = await POST(createRequest({ prompt: "linen jacket" }));
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "認証が必要です",
          "errorCode": "GENERATION_AUTH_REQUIRED",
        },
        "status": 401,
      }
    `);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  test("CHAR-GENERATE-ASYNC-002: invalid schema returns 400 with first issue message", async () => {
    const response = await POST(createRequest({ prompt: "" }));
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "着せ替え内容を入力してください",
          "errorCode": "GENERATION_INVALID_REQUEST",
        },
        "status": 400,
      }
    `);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  test("CHAR-GENERATE-ASYNC-003: insufficient credits returns 400 and skips job creation", async () => {
    const supabase = createSupabaseMock({
      creditBalance: 5,
    });
    createAdminClientMock.mockReturnValue(
      supabase.client as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(
      createRequest({
        prompt: "linen jacket",
        sourceImageBase64: SAMPLE_SOURCE_IMAGE_BASE64,
        sourceImageMimeType: "image/png",
      })
    );
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "ペルコイン残高が不足しています。生成には10ペルコイン必要ですが、現在の残高は5ペルコインです。",
          "errorCode": "GENERATION_INSUFFICIENT_BALANCE",
        },
        "status": 400,
      }
    `);
    expect(supabase.jobsBuilder.insert).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("CHAR-GENERATE-ASYNC-004: queue send error returns 202 with warning", async () => {
    const supabase = createSupabaseMock({
      creditBalance: 120,
      rpcError: { message: "queue down" },
    });
    createAdminClientMock.mockReturnValue(
      supabase.client as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(
      createRequest({
        prompt: "linen jacket",
        sourceImageBase64: SAMPLE_SOURCE_IMAGE_BASE64,
        sourceImageMimeType: "image/png",
      })
    );
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
      queueCall: supabase.rpc.mock.calls[0],
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "jobId": "job-001",
          "status": "queued",
          "warning": "ジョブは作成されましたが、処理の開始が遅延する可能性があります。数秒後に再確認してください。",
        },
        "queueCall": [
          "pgmq_send",
          {
            "p_delay": 0,
            "p_message": {
              "job_id": "job-001",
            },
            "p_queue_name": "image_jobs",
          },
        ],
        "status": 202,
      }
    `);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/image-gen-worker",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  test("CHAR-GENERATE-ASYNC-005: source image upload path succeeds and stores public URL in job", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1730000000000);
    jest.spyOn(Math, "random").mockReturnValue(0.123456789);

    const supabase = createSupabaseMock({
      creditBalance: 120,
      uploadResult: {
        data: { path: "temp/user-123/1730000000000-uploaded.png" },
        error: null,
      },
      publicUrl: "https://cdn.example.com/temp/uploaded.png",
      jobResult: {
        data: { id: "job-xyz", status: "queued" },
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(
      supabase.client as unknown as ReturnType<typeof createAdminClient>
    );

    const base64 = Buffer.from("image-bytes").toString("base64");
    const response = await POST(
      createRequest({
        prompt: "linen jacket",
        sourceImageBase64: `data:image/png;base64,${base64}`,
        sourceImageMimeType: "image/png",
        sourceImageType: "real",
        backgroundMode: "keep",
        generationType: "coordinate",
      })
    );
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
      uploadCall: supabase.upload.mock.calls[0],
      insertedJob: supabase.jobsBuilder.insert.mock.calls[0]?.[0]?.[0],
      queueCall: supabase.rpc.mock.calls[0],
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "jobId": "job-xyz",
          "status": "queued",
        },
        "insertedJob": {
          "attempts": 0,
          "background_change": false,
          "background_mode": "keep",
          "generation_type": "coordinate",
          "input_image_url": "https://cdn.example.com/temp/uploaded.png",
          "model": "gpt-image-2-low",
          "processing_stage": "queued",
          "prompt_text": "linen jacket",
          "source_image_stock_id": null,
          "source_image_type": "real",
          "status": "queued",
          "user_id": "user-123",
        },
        "queueCall": [
          "pgmq_send",
          {
            "p_delay": 0,
            "p_message": {
              "job_id": "job-xyz",
            },
            "p_queue_name": "image_jobs",
          },
        ],
        "status": 200,
        "uploadCall": [
          "temp/user-123/1730000000000-4fzzzxjylrx.png",
          {
            "data": [
              105,
              109,
              97,
              103,
              101,
              45,
              98,
              121,
              116,
              101,
              115,
            ],
            "type": "Buffer",
          },
          {
            "contentType": "image/png",
            "upsert": false,
          },
        ],
      }
    `);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/image-gen-worker",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  test("CHAR-GENERATE-ASYNC-006: gpt-image-2-low job records 10 percoin cost and uses provider model id", async () => {
    const supabase = createSupabaseMock({
      creditBalance: 30,
      jobResult: {
        data: { id: "job-openai-001", status: "queued" },
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(
      supabase.client as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(
      createRequest({
        prompt: "monochrome trench coat",
        sourceImageBase64: SAMPLE_SOURCE_IMAGE_BASE64,
        sourceImageMimeType: "image/png",
        model: "gpt-image-2-low",
      })
    );
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
      insertedModel: supabase.jobsBuilder.insert.mock.calls[0]?.[0]?.[0]?.model,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "jobId": "job-openai-001",
          "status": "queued",
        },
        "insertedModel": "gpt-image-2-low",
        "status": 200,
      }
    `);
    // 10 ペルコイン残高チェックが効いていることの確認: 残高 30 で 400 にならない
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/image-gen-worker",
      expect.objectContaining({ method: "POST" })
    );
  });

  test("CHAR-GENERATE-ASYNC-007: gpt-image-2-low rejects insufficient balance below 10 percoin", async () => {
    const supabase = createSupabaseMock({
      creditBalance: 5,
    });
    createAdminClientMock.mockReturnValue(
      supabase.client as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(
      createRequest({
        prompt: "monochrome trench coat",
        sourceImageBase64: SAMPLE_SOURCE_IMAGE_BASE64,
        sourceImageMimeType: "image/png",
        model: "gpt-image-2-low",
      })
    );
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "ペルコイン残高が不足しています。生成には10ペルコイン必要ですが、現在の残高は5ペルコインです。",
          "errorCode": "GENERATION_INSUFFICIENT_BALANCE",
        },
        "status": 400,
      }
    `);
    expect(supabase.jobsBuilder.insert).not.toHaveBeenCalled();
  });
});

/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/generation-history/picker/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;

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

/** chainable query builder mock that resolves with the given payload at .range() */
function buildSelectChain(payload: {
  data: unknown[] | null;
  error: { message: string } | null;
}) {
  const range = jest.fn().mockResolvedValue(payload);
  const order = jest.fn().mockReturnValue({ range });
  const inFn = jest.fn().mockReturnValue({ order });
  const eq = jest.fn().mockReturnValue({ in: inFn });
  const select = jest.fn().mockReturnValue({ eq });
  return { select, eq, inFn, order, range };
}

describe("GET /api/generation-history/picker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("未認証時は 401 を返す", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await GET(
      createRequest("https://example.test/api/generation-history/picker")
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.errorCode).toBe("GENERATION_AUTH_REQUIRED");
  });

  test("認証済みで結果が limit 以下のとき nextOffset=null", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    const chain = buildSelectChain({
      data: [
        {
          id: "g-1",
          image_url: "https://cdn.example/img1.webp",
          storage_path: "user-1/coordinate/img1.webp",
          created_at: "2026-05-01T00:00:00.000Z",
          generation_type: "coordinate",
        },
      ],
      error: null,
    });
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({ select: chain.select }),
    } as never);

    const response = await GET(
      createRequest(
        "https://example.test/api/generation-history/picker?limit=50&offset=0"
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      kind: "generated",
      id: "g-1",
      imageUrl: "https://cdn.example/img1.webp",
      storagePath: "user-1/coordinate/img1.webp",
      createdAt: "2026-05-01T00:00:00.000Z",
      generationType: "coordinate",
    });
    expect(body.nextOffset).toBeNull();
  });

  test("limit+1 件返ったときは limit に切り詰めて nextOffset を埋める", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    // limit=2 を要求し、3 件 (= limit + 1) 返るケース
    const rows = Array.from({ length: 3 }).map((_, idx) => ({
      id: `g-${idx}`,
      image_url: `https://cdn.example/img${idx}.webp`,
      storage_path: `user-1/coordinate/img${idx}.webp`,
      created_at: `2026-05-0${idx + 1}T00:00:00.000Z`,
      generation_type: "coordinate",
    }));
    const chain = buildSelectChain({ data: rows, error: null });
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({ select: chain.select }),
    } as never);

    const response = await GET(
      createRequest(
        "https://example.test/api/generation-history/picker?limit=2&offset=10"
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextOffset).toBe(12);
  });

  test("空配列のとき items=[]、nextOffset=null", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    const chain = buildSelectChain({ data: [], error: null });
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({ select: chain.select }),
    } as never);

    const response = await GET(
      createRequest("https://example.test/api/generation-history/picker")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([]);
    expect(body.nextOffset).toBeNull();
  });

  test("DB エラー時は 500 を返す", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    const chain = buildSelectChain({
      data: null,
      error: { message: "boom" },
    });
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({ select: chain.select }),
    } as never);

    const response = await GET(
      createRequest("https://example.test/api/generation-history/picker")
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.errorCode).toBe("GENERATION_HISTORY_FETCH_FAILED");
  });

  test("不正な limit/offset は安全な既定値にクランプされる", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    const chain = buildSelectChain({ data: [], error: null });
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({ select: chain.select }),
    } as never);

    const response = await GET(
      createRequest(
        "https://example.test/api/generation-history/picker?limit=abc&offset=-5"
      )
    );

    expect(response.status).toBe(200);
    // 既定 limit=50 / offset=0 で range(0, 50) が呼ばれる (limit+1 取得方式)
    expect(chain.range).toHaveBeenCalledWith(0, 50);
  });
});

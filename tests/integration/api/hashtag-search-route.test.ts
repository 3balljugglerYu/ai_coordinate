/** @jest-environment node */

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/hashtags/search/route";
import { getUser } from "@/lib/auth";
import { isSearchAvailable } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isSearchAvailable: jest.fn(),
}));
jest.mock("@/lib/supabase/admin");

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockIsSearchAvailable = isSearchAvailable as jest.MockedFunction<
  typeof isSearchAvailable
>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

function mockRpc(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  mockCreateAdminClient.mockReturnValue({ rpc } as never);
  return rpc;
}

function createRequest(query: string): NextRequest {
  const request = new Request(`http://localhost/api/hashtags/search${query}`);
  return Object.assign(request, { nextUrl: new URL(request.url) }) as NextRequest;
}

describe("GET /api/hashtags/search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockIsSearchAvailable.mockReturnValue(true);
  });

  test("正規化した前置きで RPC を呼ぶ", async () => {
    // 正規化は TypeScript が正本。SQL 側で小文字化すると言語によって結果がズレる
    const rpc = mockRpc({ data: [{ name: "冬服", post_count: 3 }] });

    const response = await GET(createRequest("?prefix=%23AI"));
    const body = await response.json();

    expect(rpc).toHaveBeenCalledWith("search_hashtags", {
      p_prefix: "#ai",
      p_limit: 8,
    });
    expect(body.hashtags).toHaveLength(1);
  });

  test("段階公開中の一般ユーザーには空で返す", async () => {
    mockIsSearchAvailable.mockReturnValue(false);
    const rpc = mockRpc({ data: [] });

    const response = await GET(createRequest("?prefix=冬"));

    expect(response.status).toBe(200);
    expect((await response.json()).hashtags).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("未ログインには空で返す", async () => {
    mockGetUser.mockResolvedValue(null);
    const rpc = mockRpc({ data: [] });

    await GET(createRequest("?prefix=冬"));

    expect(rpc).not.toHaveBeenCalled();
  });

  test("prefix が空なら問い合わせない", async () => {
    const rpc = mockRpc({ data: [] });

    await GET(createRequest("?prefix=%20"));

    expect(rpc).not.toHaveBeenCalled();
  });

  test("長すぎる prefix は問い合わせない", async () => {
    const rpc = mockRpc({ data: [] });

    await GET(createRequest(`?prefix=${"あ".repeat(51)}`));

    expect(rpc).not.toHaveBeenCalled();
  });

  test("RPC エラーでも入力を妨げない", async () => {
    mockRpc({ error: { message: "boom" } });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(createRequest("?prefix=冬"));

    expect(response.status).toBe(200);
    expect((await response.json()).hashtags).toEqual([]);
    errorSpy.mockRestore();
  });
});

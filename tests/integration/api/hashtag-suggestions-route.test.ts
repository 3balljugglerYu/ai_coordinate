/** @jest-environment node */

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/hashtags/suggestions/route";
import { getUser } from "@/lib/auth";
import { isSearchAvailable } from "@/lib/env";
import { getHashtagSuggestions } from "@/features/posts/lib/hashtag-suggestions";

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isSearchAvailable: jest.fn(),
}));
jest.mock("@/features/posts/lib/hashtag-suggestions", () => ({
  getHashtagSuggestions: jest.fn(),
}));

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockIsSearchAvailable = isSearchAvailable as jest.MockedFunction<
  typeof isSearchAvailable
>;
const mockGetHashtagSuggestions =
  getHashtagSuggestions as jest.MockedFunction<typeof getHashtagSuggestions>;

const IMAGE_ID = "11111111-1111-1111-1111-111111111111";

function createRequest(query: string): NextRequest {
  const request = new Request(`http://localhost/api/hashtags/suggestions${query}`);
  return Object.assign(request, {
    nextUrl: new URL(request.url),
  }) as NextRequest;
}

describe("GET /api/hashtags/suggestions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockIsSearchAvailable.mockReturnValue(true);
    mockGetHashtagSuggestions.mockResolvedValue([
      { name: "うちの子のオーストラリア旅行", source: "category" },
    ]);
  });

  test("候補を返す", async () => {
    const response = await GET(createRequest(`?imageId=${IMAGE_ID}`));
    const body = await response.json();

    expect(body.suggestions).toHaveLength(1);
    expect(mockGetHashtagSuggestions).toHaveBeenCalledWith("user-1", IMAGE_ID);
  });

  test("段階公開中の一般ユーザーには空で返す", async () => {
    // エラーにはしない。応答の違いから公開前機能の存在を推測させないため
    mockIsSearchAvailable.mockReturnValue(false);

    const response = await GET(createRequest(`?imageId=${IMAGE_ID}`));

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toEqual([]);
    expect(mockGetHashtagSuggestions).not.toHaveBeenCalled();
  });

  test("未ログインには空で返す", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await GET(createRequest(`?imageId=${IMAGE_ID}`));

    expect((await response.json()).suggestions).toEqual([]);
    expect(mockGetHashtagSuggestions).not.toHaveBeenCalled();
  });

  test("imageId が UUID でなければ問い合わせない", async () => {
    const response = await GET(createRequest("?imageId=not-a-uuid"));

    expect((await response.json()).suggestions).toEqual([]);
    expect(mockGetHashtagSuggestions).not.toHaveBeenCalled();
  });
});

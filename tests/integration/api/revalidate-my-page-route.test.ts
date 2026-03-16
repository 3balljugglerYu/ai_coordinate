/** @jest-environment node */

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/revalidate/my-page/route";
import { revalidatePath, revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { getRouteLocale } from "@/lib/api/route-locale";

jest.mock("next/cache");
jest.mock("@/lib/auth");
jest.mock("@/lib/api/route-locale");

const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockGetRouteLocale = getRouteLocale as jest.MockedFunction<
  typeof getRouteLocale
>;

function createRequest(body?: unknown): NextRequest {
  return new Request("http://localhost/api/revalidate/my-page", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("Revalidate my page route", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRevalidateTag.mockImplementation(() => {});
    mockRevalidatePath.mockImplementation(() => {});
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({
      id: "user-1",
      email: "user-1@example.com",
    } as never);
  });

  test("POST_imageId付きの場合_一覧と詳細のキャッシュを即時失効する", async () => {
    const response = await POST(createRequest({ imageId: "image-1" }));

    expect(response.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalledWith("my-page-user-1", {
      expire: 0,
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("my-page-image-user-1-image-1", {
      expire: 0,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-page");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-page/image-1");
  });
});

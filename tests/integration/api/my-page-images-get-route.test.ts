/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/features/my-page/lib/server-api");
jest.mock("@/lib/api/route-locale");

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/my-page/images/route";
import { getUser } from "@/lib/auth";
import { getMyImagesServer } from "@/features/my-page/lib/server-api";
import { getRouteLocale } from "@/lib/api/route-locale";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockGetMyImagesServer = getMyImagesServer as jest.MockedFunction<
  typeof getMyImagesServer
>;
const mockGetRouteLocale = getRouteLocale as jest.MockedFunction<
  typeof getRouteLocale
>;

function createRequest(searchParams: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/my-page/images");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  const request = new Request(url);
  return Object.assign(request, {
    nextUrl: url,
    cookies: { get: () => undefined },
  }) as unknown as NextRequest;
}

describe("GET /api/my-page/images", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({
      id: "user-1",
      email: "user-1@example.com",
    } as never);
  });

  test("認証済みでクエリ未指定の場合_デフォルト all / limit=20 / offset=0 で取得し hasMore を limit と件数で判定する", async () => {
    // 20 件返す → hasMore=true
    const images = Array.from({ length: 20 }, (_, i) => ({ id: `img-${i}` }));
    mockGetMyImagesServer.mockResolvedValue(images as never);

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetMyImagesServer).toHaveBeenCalledWith("user-1", "all", 20, 0);
    expect(body.images).toEqual(images);
    expect(body.hasMore).toBe(true);
  });

  test("件数が limit 未満の場合_hasMore は false になる", async () => {
    mockGetMyImagesServer.mockResolvedValue([{ id: "img-0" }] as never);

    const res = await GET(createRequest({ limit: "20" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasMore).toBe(false);
  });

  test("filter/limit/offset を渡した場合_その値で getMyImagesServer を呼ぶ", async () => {
    mockGetMyImagesServer.mockResolvedValue([] as never);

    await GET(
      createRequest({ filter: "unposted", limit: "10", offset: "30" }),
    );

    expect(mockGetMyImagesServer).toHaveBeenCalledWith(
      "user-1",
      "unposted",
      10,
      30,
    );
  });

  test("未ログインの場合_401 で MY_PAGE_AUTH_REQUIRED を返す", async () => {
    mockGetUser.mockResolvedValue(null as never);

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.errorCode).toBe("MY_PAGE_AUTH_REQUIRED");
    expect(mockGetMyImagesServer).not.toHaveBeenCalled();
  });

  test("getMyImagesServer が throw した場合_500 で MY_PAGE_IMAGES_FETCH_FAILED を返す", async () => {
    mockGetMyImagesServer.mockRejectedValue(new Error("db down"));
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("MY_PAGE_IMAGES_FETCH_FAILED");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

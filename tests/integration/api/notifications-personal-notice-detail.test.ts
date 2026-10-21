/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({ admin: true })),
}));

jest.mock("@/features/notifications/lib/personal-notice-detail", () => ({
  getPersonalNoticeDetailForUser: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/notifications/messages/[id]/route";
import { getUser } from "@/lib/auth";
import { getPersonalNoticeDetailForUser } from "@/features/notifications/lib/personal-notice-detail";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockGetDetail = getPersonalNoticeDetailForUser as jest.MockedFunction<
  typeof getPersonalNoticeDetailForUser
>;

const NOTICE_ID = "11111111-2222-4333-8444-555555555555";

function createRequest(acceptLanguage = "ja"): NextRequest {
  const url = `http://localhost:3000/api/notifications/messages/${NOTICE_ID}`;
  const request = new Request(url, {
    method: "GET",
    headers: { "accept-language": acceptLanguage },
  });
  return Object.assign(request, {
    nextUrl: new URL(url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function params(id = NOTICE_ID) {
  return { params: Promise.resolve({ id }) };
}

const NOTICE = {
  id: NOTICE_ID,
  title: "ハロウィン企画の結果",
  body: "受付番号 A-001",
  receivedAtLabel: "2026年10月20日",
  post: { id: "post-1", imageUrl: "https://example.com/p.webp" },
  alreadyOpened: false,
};

describe("GET /api/notifications/messages/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("未ログインは401で読まない", async () => {
    mockGetUser.mockResolvedValue(null);

    const res = await GET(createRequest(), params());

    expect(res.status).toBe(401);
    expect(mockGetDetail).not.toHaveBeenCalled();
  });

  test("UUIDでないIDは400で読まない", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);

    const res = await GET(createRequest(), params("not-a-uuid"));

    expect(res.status).toBe(400);
    expect(mockGetDetail).not.toHaveBeenCalled();
  });

  test("本人のお知らせをセッションのuser_idと言語で読み_詳細を返す", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockGetDetail.mockResolvedValue(NOTICE);

    const res = await GET(createRequest("en"), params());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notice: NOTICE });
    expect(mockGetDetail).toHaveBeenCalledWith(
      { admin: true },
      { notificationId: NOTICE_ID, userId: "user-1", locale: "en" }
    );
  });

  test("本人以外・取り消し済み(null)は404", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockGetDetail.mockResolvedValue(null);

    const res = await GET(createRequest(), params());

    expect(res.status).toBe(404);
  });

  test("読み込みのエラーは500", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockGetDetail.mockRejectedValue(new Error("boom"));

    const res = await GET(createRequest(), params());

    expect(res.status).toBe(500);
  });
});

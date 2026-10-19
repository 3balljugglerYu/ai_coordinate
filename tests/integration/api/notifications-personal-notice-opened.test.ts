/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/notifications/messages/[id]/opened/route";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>;

const NOTICE_ID = "11111111-2222-4333-8444-555555555555";

function createRequest(origin: string | null): NextRequest {
  const url = `http://localhost:3000/api/notifications/messages/${NOTICE_ID}/opened`;
  const headers: Record<string, string> = { "accept-language": "ja" };
  if (origin) headers.origin = origin;
  const request = new Request(url, { method: "POST", headers });
  return Object.assign(request, {
    nextUrl: new URL(url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function params(id = NOTICE_ID) {
  return { params: Promise.resolve({ id }) };
}

function mockRpc(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  mockCreateAdminClient.mockReturnValue({ rpc } as never);
  return rpc;
}

describe("POST /api/notifications/messages/[id]/opened", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("別サイトからのリクエストは403で記録しない", async () => {
    const rpc = mockRpc({ data: true, error: null });
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(createRequest("https://evil.example"), params());

    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("未ログインは401で記録しない", async () => {
    const rpc = mockRpc({ data: true, error: null });
    mockGetUser.mockResolvedValue(null);

    const res = await POST(createRequest("http://localhost:3000"), params());

    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("UUIDでないIDは400で記録しない", async () => {
    const rpc = mockRpc({ data: true, error: null });
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(
      createRequest("http://localhost:3000"),
      params("not-a-uuid")
    );

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("本人の行が記録されるとセッションのuser_idで呼び_キャッシュを捨てる", async () => {
    const rpc = mockRpc({ data: true, error: null });
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(createRequest("http://localhost:3000"), params());

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mark_personal_notice_opened", {
      p_user_id: "user-1",
      p_notification_id: NOTICE_ID,
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("notifications-user-1", "max");
  });

  test("本人以外・取り消し済み(RPCがfalse)は404", async () => {
    mockRpc({ data: false, error: null });
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(createRequest("http://localhost:3000"), params());

    expect(res.status).toBe(404);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  test("RPCのエラーは500", async () => {
    mockRpc({ data: null, error: { message: "boom" } });
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);

    const res = await POST(createRequest("http://localhost:3000"), params());

    expect(res.status).toBe(500);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});

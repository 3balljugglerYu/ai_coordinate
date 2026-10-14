/** @jest-environment node */

/**
 * 全体配信のプッシュ通知（/api/admin/push-broadcasts）。
 *
 * この API が守るのは:
 *  - 管理者だけが作れる・取り消せる
 *  - 行き先はアプリ内のパスか https の URL だけ（javascript: などを通さない）
 *  - 過去の予約日時は入力ミスとして断る（保存した瞬間に送られてしまう）
 *  - 取り消せるのは予約中だけ（送信が始まったら 409）
 */

import { NextResponse } from "next/server";

jest.mock("@/lib/auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/admin-audit", () => ({ logAdminAction: jest.fn() }));
jest.mock("@/features/push-broadcasts/lib/push-broadcast-repository", () => ({
  createPushBroadcast: jest.fn(),
  listPushBroadcastsForAdmin: jest.fn(),
  getPushBroadcastById: jest.fn(),
  cancelScheduledPushBroadcast: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/push-broadcasts/route";
import { PATCH } from "@/app/api/admin/push-broadcasts/[id]/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  cancelScheduledPushBroadcast,
  createPushBroadcast,
  getPushBroadcastById,
  listPushBroadcastsForAdmin,
} from "@/features/push-broadcasts/lib/push-broadcast-repository";
import type { PushBroadcast } from "@/features/push-broadcasts/lib/schema";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockLog = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockCreate = createPushBroadcast as jest.MockedFunction<typeof createPushBroadcast>;
const mockList = listPushBroadcastsForAdmin as jest.MockedFunction<
  typeof listPushBroadcastsForAdmin
>;
const mockGet = getPushBroadcastById as jest.MockedFunction<typeof getPushBroadcastById>;
const mockCancel = cancelScheduledPushBroadcast as jest.MockedFunction<
  typeof cancelScheduledPushBroadcast
>;

const BROADCAST_ID = "11111111-1111-4111-8111-111111111111";

function broadcast(overrides: Partial<PushBroadcast> = {}): PushBroadcast {
  return {
    id: BROADCAST_ID,
    title: "ハロウィン企画",
    body: "",
    url: null,
    announcementId: null,
    sendAt: "2026-10-20T11:00:00.000Z",
    status: "scheduled",
    enqueuedCount: 0,
    createdBy: "admin-1",
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    canceledAt: null,
    ...overrides,
  };
}

function postRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/admin/push-broadcasts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function patchRequest(body: unknown): NextRequest {
  return new Request(`http://localhost/api/admin/push-broadcasts/${BROADCAST_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const params = (id = BROADCAST_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
  mockCreate.mockImplementation(async (input) =>
    broadcast({
      title: input.title,
      body: input.body,
      url: input.url,
      sendAt: input.sendAt,
    })
  );
});

describe("権限", () => {
  test("管理者でなければ作れない（requireAdmin の応答をそのまま返す）", async () => {
    mockRequireAdmin.mockRejectedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST(postRequest({ title: "x" }));

    expect(response.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("管理者でなければ取り消せない", async () => {
    mockRequireAdmin.mockRejectedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await PATCH(patchRequest({ status: "canceled" }), params());

    expect(response.status).toBe(403);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/push-broadcasts", () => {
  test("配信履歴を返す", async () => {
    mockList.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("POST /api/admin/push-broadcasts", () => {
  test("日時を指定しなければ今すぐ送る（send_at = 今）", async () => {
    const before = Date.now();

    const response = await POST(postRequest({ title: " ハロウィン企画 ", body: "本文" }));

    expect(response.status).toBe(200);
    const sendAt = new Date(mockCreate.mock.calls[0][0].sendAt).getTime();
    expect(sendAt).toBeGreaterThanOrEqual(before);
    expect(sendAt).toBeLessThanOrEqual(Date.now());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      title: "ハロウィン企画",
      body: "本文",
      url: null,
      createdBy: "admin-1",
    });
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "push_broadcast_create",
        targetType: "admin_push_broadcast",
        targetId: BROADCAST_ID,
      })
    );
  });

  test("未来の日時で予約できる", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const response = await POST(postRequest({ title: "予約", sendAt: future }));

    expect(response.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].sendAt).toBe(future);
    const json = await response.json();
    expect(json.statusLabel).toBe("予約中");
  });

  test("過去の日時は 400（保存した瞬間に送られてしまう）", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const response = await POST(postRequest({ title: "予約", sendAt: past }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("タイトルが空なら 400", async () => {
    const response = await POST(postRequest({ title: "   " }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test.each(["/style", "/notifications/announcements/abc", "https://persta.ai/guide/gacha"])(
    "行き先 %s は受け付ける",
    async (url) => {
      const response = await POST(postRequest({ title: "x", url }));

      expect(response.status).toBe(200);
      expect(mockCreate.mock.calls[0][0].url).toBe(url);
    }
  );

  test.each([
    "javascript:alert(1)",
    "http://example.com",
    "//evil.example.com",
    "style",
  ])("行き先 %s は 400", async (url) => {
    const response = await POST(postRequest({ title: "x", url }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("行き先が空文字なら null で保存する", async () => {
    const response = await POST(postRequest({ title: "x", url: "" }));

    expect(response.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].url).toBeNull();
  });
});

describe("PATCH /api/admin/push-broadcasts/[id]", () => {
  test("予約中なら取り消せる", async () => {
    mockGet.mockResolvedValue(broadcast());
    mockCancel.mockResolvedValue(broadcast({ status: "canceled" }));

    const response = await PATCH(patchRequest({ status: "canceled" }), params());

    expect(response.status).toBe(200);
    expect(mockCancel).toHaveBeenCalledWith(BROADCAST_ID);
    expect((await response.json()).status).toBe("canceled");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "push_broadcast_cancel" })
    );
  });

  test("送信が始まっていたら 409", async () => {
    mockGet.mockResolvedValue(broadcast({ status: "sending" }));
    mockCancel.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ status: "canceled" }), params());

    expect(response.status).toBe(409);
    expect(mockLog).not.toHaveBeenCalled();
  });

  test("無い配信は 404", async () => {
    mockGet.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ status: "canceled" }), params());

    expect(response.status).toBe(404);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  test("id が UUID でなければ 404（DB に問い合わせない）", async () => {
    const response = await PATCH(
      patchRequest({ status: "canceled" }),
      params("not-a-uuid")
    );

    expect(response.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test("取り消し以外の変更は 400", async () => {
    const response = await PATCH(patchRequest({ status: "sent" }), params());

    expect(response.status).toBe(400);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

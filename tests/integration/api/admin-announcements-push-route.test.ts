/** @jest-environment node */

/**
 * 運営お知らせの保存と「プッシュ通知も送る」（Phase 5）。
 *
 * 守ること:
 *  - 画面のチェック（sendPush）をそのまま配信の同期に渡す
 *  - プッシュの予約だけ失敗しても、お知らせの保存は成功として返す
 *    （失敗扱いにすると作り直しで同じお知らせが二重になる）。代わりに pushError を返す
 */

jest.mock("@/lib/auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/admin-audit", () => ({ logAdminAction: jest.fn() }));
jest.mock("@/features/announcements/lib/announcement-repository", () => ({
  createAnnouncement: jest.fn(),
  listAnnouncementsForAdmin: jest.fn(),
  getAnnouncementForAdminById: jest.fn(),
  updateAnnouncement: jest.fn(),
  deleteAnnouncement: jest.fn(),
}));
jest.mock("@/features/announcements/lib/announcement-rich-text", () => ({
  validateAnnouncementDocument: jest.fn((bodyJson: unknown) => ({ ok: true, bodyJson })),
  extractAnnouncementBodyText: jest.fn(() => "本文"),
  extractAnnouncementAssetPaths: jest.fn(() => []),
  hasMeaningfulAnnouncementContent: jest.fn(() => true),
}));
jest.mock("@/features/announcements/lib/announcement-storage", () => ({
  deleteAnnouncementImages: jest.fn(),
}));
jest.mock("@/features/announcements/lib/revalidate-announcements", () => ({
  revalidateAnnouncements: jest.fn(),
}));
jest.mock("@/features/push-broadcasts/lib/push-broadcast-repository", () => ({
  getPushBroadcastForAnnouncement: jest.fn(),
}));
jest.mock("@/features/push-broadcasts/lib/announcement-push-service", () => ({
  syncAnnouncementPush: jest.fn(),
  attachAnnouncementPushSummaries: jest.fn(async (items: unknown[]) => items),
}));

import { NextRequest as NextRequestImpl, type NextRequest } from "next/server";
import { POST } from "@/app/api/admin/announcements/route";
import { DELETE, PATCH } from "@/app/api/admin/announcements/[id]/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementForAdminById,
  updateAnnouncement,
} from "@/features/announcements/lib/announcement-repository";
import { getPushBroadcastForAnnouncement } from "@/features/push-broadcasts/lib/push-broadcast-repository";
import { syncAnnouncementPush } from "@/features/push-broadcasts/lib/announcement-push-service";
import type { AnnouncementAdmin } from "@/features/announcements/lib/schema";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockCreate = createAnnouncement as jest.MockedFunction<typeof createAnnouncement>;
const mockGet = getAnnouncementForAdminById as jest.MockedFunction<
  typeof getAnnouncementForAdminById
>;
const mockUpdate = updateAnnouncement as jest.MockedFunction<typeof updateAnnouncement>;
const mockSync = syncAnnouncementPush as jest.MockedFunction<typeof syncAnnouncementPush>;
const mockLog = logAdminAction as jest.MockedFunction<typeof logAdminAction>;

const PUBLISH_AT = "2026-10-20T11:00:00.000Z";

function announcement(overrides: Partial<AnnouncementAdmin> = {}): AnnouncementAdmin {
  return {
    id: "a1",
    title: "ハロウィン企画",
    bodyJson: { type: "doc" },
    bodyText: "本文",
    assetPaths: [],
    status: "published",
    publishAt: PUBLISH_AT,
    createdBy: "admin-1",
    updatedBy: "admin-1",
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    ...overrides,
  };
}

function request(
  method: string,
  body: unknown,
  origin: string | null = "http://localhost"
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequestImpl("http://localhost/api/admin/announcements", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const saveBody = (extra: Record<string, unknown> = {}) => ({
  title: "ハロウィン企画",
  status: "published",
  publishAt: PUBLISH_AT,
  bodyJson: { type: "doc" },
  ...extra,
});

const pushSummary = {
  id: "b1",
  status: "scheduled" as const,
  sendAt: PUBLISH_AT,
  enqueuedCount: 0,
  pendingCount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
  mockCreate.mockResolvedValue(announcement());
  mockGet.mockResolvedValue(announcement());
  mockUpdate.mockResolvedValue(announcement());
});

describe("POST /api/admin/announcements", () => {
  test("「プッシュ通知も送る」を配信の同期に渡し、予約を返す", async () => {
    mockSync.mockResolvedValue({ action: "create", push: pushSummary });

    const response = await POST(request("POST", saveBody({ sendPush: true })));

    expect(response.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith({
      announcement: expect.objectContaining({ id: "a1", publishAt: PUBLISH_AT }),
      sendPush: true,
      adminUserId: "admin-1",
      // 作ったばかりなので配信は読まずに決める
      isNew: true,
    });
    const json = await response.json();
    expect(json.push).toEqual(pushSummary);
    expect(json.pushError).toBeUndefined();
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "announcement_create",
        metadata: expect.objectContaining({ push: "create" }),
      })
    );
  });

  test("プッシュの予約だけ失敗しても 200 で、pushError を返す", async () => {
    mockSync.mockResolvedValue({
      action: "create",
      push: null,
      error: "プッシュ通知の予約に失敗しました",
    });

    const response = await POST(request("POST", saveBody({ sendPush: true })));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe("a1");
    expect(json.pushError).toBe("プッシュ通知の予約に失敗しました");
  });

  test("sendPush が真偽値でなければ 400", async () => {
    const response = await POST(request("POST", saveBody({ sendPush: "yes" })));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/announcements/[id]", () => {
  test("保存後の公開日時・状態で配信を合わせる（チェックを外した場合も渡す）", async () => {
    const later = "2026-10-21T11:00:00.000Z";
    mockUpdate.mockResolvedValue(announcement({ publishAt: later }));
    mockSync.mockResolvedValue({ action: "cancel", push: { ...pushSummary, status: "canceled" } });

    const response = await PATCH(request("PATCH", saveBody({ publishAt: later, sendPush: false })), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith({
      announcement: expect.objectContaining({ id: "a1", publishAt: later }),
      sendPush: false,
      adminUserId: "admin-1",
    });
    expect((await response.json()).push.status).toBe("canceled");
  });

  test("取り消しが効かなかった（送信が始まっていた）ら、画面と監査ログに pushError を残す", async () => {
    const error = "プッシュ通知はすでに送信が始まっていたため、取り消せませんでした";
    mockUpdate.mockResolvedValue(announcement({ status: "draft", publishAt: null }));
    mockSync.mockResolvedValue({
      action: "cancel",
      push: { ...pushSummary, status: "sent", enqueuedCount: 3 },
      error,
    });

    const response = await PATCH(
      request("PATCH", saveBody({ status: "draft", publishAt: null, sendPush: false })),
      { params: Promise.resolve({ id: "a1" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.pushError).toBe(error);
    expect(json.push.status).toBe("sent");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "announcement_update",
        metadata: expect.objectContaining({ push: "cancel", pushError: error }),
      })
    );
  });
});

describe("DELETE /api/admin/announcements/[id]", () => {
  const mockDelete = deleteAnnouncement as jest.MockedFunction<typeof deleteAnnouncement>;
  const mockGetPush = getPushBroadcastForAnnouncement as jest.MockedFunction<
    typeof getPushBroadcastForAnnouncement
  >;
  const deleteParams = { params: Promise.resolve({ id: "a1" }) };

  test("⭐消す前に、配信の記録を操作ログに写す（配信の行は CASCADE で消えるため）", async () => {
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockGet.mockResolvedValue(announcement());
    mockGetPush.mockResolvedValue({
      id: "b1",
      title: "ハロウィン企画",
      body: "本文",
      url: null,
      announcementId: "a1",
      sendAt: PUBLISH_AT,
      status: "sent",
      enqueuedCount: 12,
      createdBy: "admin-1",
      createdAt: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-14T00:00:00.000Z",
      startedAt: "2026-10-20T11:00:05.000Z",
      finishedAt: "2026-10-20T11:00:06.000Z",
      canceledAt: null,
    });

    const response = await DELETE(request("DELETE", undefined), deleteParams);

    expect(response.status).toBe(200);
    expect(mockGetPush.mock.invocationCallOrder[0]).toBeLessThan(
      mockDelete.mock.invocationCallOrder[0]
    );
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "announcement_delete",
        metadata: expect.objectContaining({
          title: "ハロウィン企画",
          push: expect.objectContaining({ id: "b1", status: "sent", enqueuedCount: 12 }),
        }),
      })
    );
  });

  test("配信の記録を読めなくても、お知らせは消す（読めなかったことを記録に残す）", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockGet.mockResolvedValue(announcement());
    mockGetPush.mockRejectedValue(new Error("boom"));

    const response = await DELETE(request("DELETE", undefined), deleteParams);

    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith("a1");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          push: { error: "プッシュ通知の記録を読めませんでした" },
        }),
      })
    );
  });
});

describe("別サイトからの保存・削除", () => {
  test.each(["POST", "PATCH", "DELETE"] as const)(
    "%s は 403 で何もしない（プッシュの配信も作る・取り消す入口なので）",
    async (method) => {
      mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
      const req = request(method, method === "DELETE" ? undefined : saveBody({ sendPush: true }), "https://evil.example");
      const response =
        method === "POST"
          ? await POST(req)
          : method === "PATCH"
            ? await PATCH(req, { params: Promise.resolve({ id: "a1" }) })
            : await DELETE(req, { params: Promise.resolve({ id: "a1" }) });

      expect(response.status).toBe(403);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSync).not.toHaveBeenCalled();
    }
  );
});

describe("PATCH で開いたときの配信の状態を渡す", () => {
  test("pushStatusSeen を配信の同期に渡す", async () => {
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockGet.mockResolvedValue(announcement());
    mockUpdate.mockResolvedValue(announcement());
    mockSync.mockResolvedValue({ action: "none", push: null });

    await PATCH(
      request("PATCH", saveBody({ pushStatusSeen: "scheduled" })),
      { params: Promise.resolve({ id: "a1" }) }
    );

    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({ pushStatusSeen: "scheduled", sendPush: undefined })
    );
  });
});

/** @jest-environment node */

/**
 * 出来事の印の API(/api/admin/timeline-events)。
 *
 * ここで守ること:
 *  - 管理者以外は読めず、書けない
 *  - 作った人(created_by)は、ログイン中の管理者で決める(本文から受け取らない)
 *  - 種類・名前・日付の確認が API でも効く(DB の CHECK に頼って 500 にしない)
 *  - 作る・直す・消すを監査ログに残す
 */

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, connection: jest.fn(async () => {}) };
});

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/admin-audit", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("@/features/admin-dashboard/lib/timeline-event-repository", () => ({
  listTimelineEvents: jest.fn(),
  createTimelineEvent: jest.fn(),
  updateTimelineEvent: jest.fn(),
  deleteTimelineEvent: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/timeline-events/route";
import { DELETE, PATCH } from "@/app/api/admin/timeline-events/[id]/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createTimelineEvent,
  deleteTimelineEvent,
  listTimelineEvents,
  updateTimelineEvent,
} from "@/features/admin-dashboard/lib/timeline-event-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockAudit = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockList = listTimelineEvents as jest.MockedFunction<typeof listTimelineEvents>;
const mockCreate = createTimelineEvent as jest.MockedFunction<typeof createTimelineEvent>;
const mockUpdate = updateTimelineEvent as jest.MockedFunction<typeof updateTimelineEvent>;
const mockDelete = deleteTimelineEvent as jest.MockedFunction<typeof deleteTimelineEvent>;

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

const EVENT = {
  id: EVENT_ID,
  eventDate: "2026-10-16",
  kind: "campaign" as const,
  title: "ハロウィン企画を開始",
  note: null,
  createdBy: ADMIN_ID,
  createdAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:00:00.000Z",
};

const VALID_BODY = {
  eventDate: "2026-10-16",
  kind: "campaign",
  title: "ハロウィン企画を開始",
};

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as never);
  mockList.mockResolvedValue([EVENT]);
  mockCreate.mockResolvedValue(EVENT);
  mockUpdate.mockResolvedValue(EVENT);
  mockDelete.mockResolvedValue(true);
  mockAudit.mockResolvedValue(undefined as never);
});

describe("GET", () => {
  test("from / to で絞って返す", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/timeline-events?from=2026-10-01&to=2026-10-31",
      ),
    );
    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-31" });
  });

  test("日付の形が違えば 400 で、読まない", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/admin/timeline-events?from=10/01"),
    );
    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  test("管理者でなければ断る", async () => {
    mockRequireAdmin.mockRejectedValue(forbidden());
    const response = await GET(new NextRequest("http://localhost/api/admin/timeline-events"));
    expect(response.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("POST", () => {
  test("作って 201 を返し、監査ログに残す。created_by はログイン中の管理者", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/admin/timeline-events", "POST", {
        ...VALID_BODY,
        createdBy: OTHER_ID,
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      eventDate: "2026-10-16",
      kind: "campaign",
      title: "ハロウィン企画を開始",
      note: null,
      createdBy: ADMIN_ID,
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "timeline_event_create",
        targetType: "admin_timeline_events",
        targetId: EVENT_ID,
      }),
    );
  });

  test("種類が一覧にない値なら 400 で、書かない", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/admin/timeline-events", "POST", {
        ...VALID_BODY,
        kind: "launch",
      }),
    );
    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("管理者でなければ断り、書かない", async () => {
    mockRequireAdmin.mockRejectedValue(forbidden());
    const response = await POST(
      jsonRequest("http://localhost/api/admin/timeline-events", "POST", VALID_BODY),
    );
    expect(response.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("書けなければ 500", async () => {
    mockCreate.mockRejectedValue(new Error("db"));
    const response = await POST(
      jsonRequest("http://localhost/api/admin/timeline-events", "POST", VALID_BODY),
    );
    expect(response.status).toBe(500);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH", () => {
  const url = `http://localhost/api/admin/timeline-events/${EVENT_ID}`;

  test("送った項目だけを直し、監査ログに直した項目を残す", async () => {
    const response = await PATCH(
      jsonRequest(url, "PATCH", { title: "名前を直す" }),
      idParams(EVENT_ID),
    );
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(EVENT_ID, { title: "名前を直す" });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "timeline_event_update",
        targetId: EVENT_ID,
        metadata: { fields: ["title"] },
      }),
    );
  });

  test("見つからなければ 404 で、監査ログに残さない", async () => {
    mockUpdate.mockResolvedValue(null);
    const response = await PATCH(jsonRequest(url, "PATCH", { title: "x" }), idParams(EVENT_ID));
    expect(response.status).toBe(404);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("直す項目が無ければ 400", async () => {
    const response = await PATCH(jsonRequest(url, "PATCH", {}), idParams(EVENT_ID));
    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("ID が UUID でなければ 400", async () => {
    const response = await PATCH(jsonRequest(url, "PATCH", { title: "x" }), idParams("abc"));
    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE", () => {
  const request = () =>
    new NextRequest(`http://localhost/api/admin/timeline-events/${EVENT_ID}`, {
      method: "DELETE",
    });

  test("消して、監査ログに残す", async () => {
    const response = await DELETE(request(), idParams(EVENT_ID));
    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(EVENT_ID);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "timeline_event_delete", targetId: EVENT_ID }),
    );
  });

  test("見つからなければ 404", async () => {
    mockDelete.mockResolvedValue(false);
    const response = await DELETE(request(), idParams(EVENT_ID));
    expect(response.status).toBe(404);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("管理者でなければ断り、消さない", async () => {
    mockRequireAdmin.mockRejectedValue(forbidden());
    const response = await DELETE(request(), idParams(EVENT_ID));
    expect(response.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

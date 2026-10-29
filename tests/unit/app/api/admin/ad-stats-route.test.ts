/** @jest-environment node */

/**
 * 広告の成果の API（/api/admin/ad-stats/import・/api/admin/ad-stats/ads）。
 *
 * ここで守ること:
 *  - 管理者以外は取り込めず、目印も変えられない
 *  - 形の違うファイルは、読めない理由を 400 で返し、何も保存しない
 *  - 取り込んだ人はログイン中の管理者で決め、取り込みと目印の変更を監査ログに残す
 *  - 目印は signup_source と同じ書式にそろえ（小文字）、空なら外す
 */

jest.mock("server-only", () => ({}));

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

jest.mock("@/features/admin-dashboard/lib/ad-stats/ad-stats-repository", () => ({
  saveAdExport: jest.fn(),
  updateAdSignupSource: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/admin/ad-stats/import/route";
import { PATCH } from "@/app/api/admin/ad-stats/ads/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  saveAdExport,
  updateAdSignupSource,
} from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockAudit = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockSave = saveAdExport as jest.MockedFunction<typeof saveAdExport>;
const mockUpdate = updateAdSignupSource as jest.MockedFunction<typeof updateAdSignupSource>;

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

const META_CSV = [
  "レポート開始日,レポート終了日,広告名,年齢,消化金額 (JPY),インプレッション,リンククリック",
  "2026-10-28,2026-10-28,90作品,35-44,200,300,10",
  "2026-10-29,2026-10-29,90作品,45-54,376,492,21",
].join("\n");

function importRequest(content: BlobPart | null, name = "meta.csv"): NextRequest {
  const form = new FormData();
  if (content !== null) form.append("file", new File([content], name));
  return new NextRequest("http://localhost/api/admin/ad-stats/import", {
    method: "POST",
    body: form,
  });
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/ad-stats/ads", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as Awaited<ReturnType<typeof requireAdmin>>);
  mockSave.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(true);
});

describe("POST /api/admin/ad-stats/import", () => {
  it("管理者でなければ取り込まない", async () => {
    mockRequireAdmin.mockRejectedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));

    const res = await POST(importRequest(META_CSV));

    expect(res.status).toBe(403);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("Meta の CSV を読み、取り込んだ人を付けて保存し、監査ログに残す", async () => {
    const res = await POST(importRequest(META_CSV));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      platform: "meta",
      rows: 2,
      ads: 1,
      dateFrom: "2026-10-28",
      dateTo: "2026-10-29",
      breakdowns: ["age"],
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "meta", rows: expect.any(Array) }),
      ADMIN_ID,
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        actionType: "ad_stats_import",
        metadata: expect.objectContaining({ fileName: "meta.csv", rows: 2 }),
      }),
    );
  });

  it("ファイルが無ければ 400", async () => {
    const res = await POST(importRequest(null));

    expect(res.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("形の違うファイルは、読めない理由を 400 で返し、保存しない", async () => {
    const res = await POST(importRequest("name,value\na,1"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("形ではありません");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("UTF-8 でない CSV は文字コードの理由を返す", async () => {
    const res = await POST(importRequest(new Uint8Array([0x83, 0x8c, 0x83, 0x7c, 0x81])));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("UTF-8");
  });

  it("壊れた xlsx は 400", async () => {
    const res = await POST(
      importRequest(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), "x.xlsx"),
    );

    expect(res.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("保存に失敗したら 500 で、取り込み直してよいことを伝える（監査ログは残さない）", async () => {
    mockSave.mockRejectedValue(new Error("db down"));

    const res = await POST(importRequest(META_CSV));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("もう一度取り込んでください");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/ad-stats/ads", () => {
  it("管理者でなければ変えない", async () => {
    mockRequireAdmin.mockRejectedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));

    const res = await PATCH(patchRequest({ platform: "meta", adKey: "name:A", signupSource: "a" }));

    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("目印を小文字にそろえて保存し、監査ログに残す", async () => {
    const res = await PATCH(
      patchRequest({ platform: "x", adKey: "111", signupSource: " Halloween-Best-Shot_X_Ad_Henshin " }),
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      platform: "x",
      adKey: "111",
      signupSource: "halloween-best-shot_x_ad_henshin",
      updatedBy: ADMIN_ID,
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "ad_signup_source_update", targetId: "x:111" }),
    );
  });

  it("空の目印は外す（null で保存）", async () => {
    await PATCH(patchRequest({ platform: "meta", adKey: "name:A", signupSource: "" }));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ signupSource: null }));
  });

  it.each([
    [{ platform: "tiktok", adKey: "1", signupSource: "a" }, "媒体が不正です"],
    [{ platform: "meta", adKey: "", signupSource: "a" }, "広告が不正です"],
    [{ platform: "meta", adKey: "name:A", signupSource: "日本語" }, "目印は半角"],
  ])("不正な入力は 400（%j）", async (body, message) => {
    const res = await PATCH(patchRequest(body));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(message);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("広告が無ければ 404", async () => {
    mockUpdate.mockResolvedValue(false);

    const res = await PATCH(patchRequest({ platform: "meta", adKey: "name:Z", signupSource: "a" }));

    expect(res.status).toBe(404);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

/** @jest-environment node */

/**
 * 見本(参照画像)を使える人の管理の API(/api/admin/i2i-allowlist・/api/admin/i2i-allowlist/[userId])。
 *
 * ここで守ること:
 *  - 管理者だけが使える。よそのサイトからの書き込みは止める
 *  - 足せるのは実在する人だけ。ユーザー ID とメモ(200文字まで・文字の数で数える)を確かめる
 *  - 実在の確認で DB が失敗したら、「見つからない」(400)ではなく 500
 *  - 足した人はログイン中の管理者で決め、足す・切り替え・削除を監査ログに残す(i2i_catalog_allowlist)
 *  - 一覧にいない人の切り替え・削除は 404 で、監査ログにも残さない
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

jest.mock("@/features/catalog-references/lib/i2i-allowlist-repository", () => ({
  listI2iAllowlist: jest.fn(),
  addI2iAllowlistMember: jest.fn(),
  setI2iAllowlistActive: jest.fn(),
  removeI2iAllowlistMember: jest.fn(),
  profileExistsForI2iAllowlist: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/i2i-allowlist/route";
import { DELETE, PATCH } from "@/app/api/admin/i2i-allowlist/[userId]/route";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  addI2iAllowlistMember,
  listI2iAllowlist,
  profileExistsForI2iAllowlist,
  removeI2iAllowlistMember,
  setI2iAllowlistActive,
} from "@/features/catalog-references/lib/i2i-allowlist-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;
const mockAudit = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockProfileExists = profileExistsForI2iAllowlist as jest.MockedFunction<typeof profileExistsForI2iAllowlist>;
const mockList = listI2iAllowlist as jest.MockedFunction<typeof listI2iAllowlist>;
const mockAdd = addI2iAllowlistMember as jest.MockedFunction<typeof addI2iAllowlistMember>;
const mockSetActive = setI2iAllowlistActive as jest.MockedFunction<typeof setI2iAllowlistActive>;
const mockRemove = removeI2iAllowlistMember as jest.MockedFunction<typeof removeI2iAllowlistMember>;

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const userParams = (userId: string) => ({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as Awaited<ReturnType<typeof requireAdmin>>);
  mockSameOrigin.mockReturnValue(null);
  mockProfileExists.mockResolvedValue(true);
  mockList.mockResolvedValue([]);
  mockAdd.mockResolvedValue({ created: true });
  mockSetActive.mockResolvedValue(true);
  mockRemove.mockResolvedValue(true);
});

describe("管理者でないとき", () => {
  beforeEach(() => {
    mockRequireAdmin.mockRejectedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  });

  test("一覧・追加・切り替え・削除のどれも 403 で、何も変えない", async () => {
    const responses = [
      await GET(),
      await POST(jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID })),
      await PATCH(
        jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "PATCH", { isActive: false }),
        userParams(USER_ID),
      ),
      await DELETE(jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "DELETE"), userParams(USER_ID)),
    ];

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

test("よそのサイトからの追加・切り替え・削除は止め、管理者の確認より前に返す", async () => {
  mockSameOrigin.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

  const responses = [
    await POST(jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID })),
    await PATCH(
      jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "PATCH", { isActive: false }),
      userParams(USER_ID),
    ),
    await DELETE(jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "DELETE"), userParams(USER_ID)),
  ];

  expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
  expect(mockRequireAdmin).not.toHaveBeenCalled();
  expect(mockAdd).not.toHaveBeenCalled();
  expect(mockSetActive).not.toHaveBeenCalled();
  expect(mockRemove).not.toHaveBeenCalled();
});

describe("POST(足す)", () => {
  test("実在する人を、ログイン中の管理者が足した人として足し、監査ログに残す", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID, note: "10月の選抜" }),
    );

    expect(response.status).toBe(200);
    expect(mockAdd).toHaveBeenCalledWith({ userId: USER_ID, note: "10月の選抜", addedBy: ADMIN_ID });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        actionType: "i2i_allowlist_add",
        targetType: "i2i_catalog_allowlist",
        targetId: USER_ID,
        metadata: { created: true, noteUpdated: true },
      }),
    );
  });

  test("もう一覧にいた人を有効にしたときは、監査ログでそれと分かる(新しく足したのではない)", async () => {
    mockAdd.mockResolvedValue({ created: false });

    await POST(jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID }));

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { created: false, noteUpdated: false } }),
    );
  });

  test("メモは文字の数で数える(絵文字200文字は通る)", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID, note: "😀".repeat(200) }),
    );

    expect(response.status).toBe(200);
  });

  test("実在の確認で DB が失敗したら 500(見つからない、にしない)", async () => {
    mockProfileExists.mockRejectedValue(new Error("timeout"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID }));

    expect(response.status).toBe(500);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test.each([
    ["ユーザー ID の形が違う", { userId: "not-a-uuid" }, "ユーザーIDが不正です"],
    ["メモが200文字を超える", { userId: USER_ID, note: "あ".repeat(201) }, "メモは200文字までです"],
  ])("%s → 400 で足さない", async (_label, body, message) => {
    const response = await POST(jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("実在しない人は 400 で足さない", async () => {
    mockProfileExists.mockResolvedValue(false);

    const response = await POST(jsonRequest("http://localhost/api/admin/i2i-allowlist", "POST", { userId: USER_ID }));

    expect(response.status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH(有効・無効)と DELETE(削除)", () => {
  test("無効にして、監査ログに切り替えの中身を残す", async () => {
    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "PATCH", { isActive: false }),
      userParams(USER_ID),
    );

    expect(response.status).toBe(200);
    expect(mockSetActive).toHaveBeenCalledWith(USER_ID, false);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "i2i_allowlist_update", metadata: { isActive: false } }),
    );
  });

  test("isActive が真偽値でなければ 400 で変えない", async () => {
    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "PATCH", { isActive: "no" }),
      userParams(USER_ID),
    );

    expect(response.status).toBe(400);
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  test.each([
    ["PATCH", () => PATCH(jsonRequest("http://localhost/api/admin/i2i-allowlist/bad", "PATCH", { isActive: true }), userParams("bad"))],
    ["DELETE", () => DELETE(jsonRequest("http://localhost/api/admin/i2i-allowlist/bad", "DELETE"), userParams("bad"))],
  ])("%s: ユーザー ID の形が違えば 400 で変えない", async (_method, call) => {
    const response = await call();

    expect(response.status).toBe(400);
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test("一覧にいない人の切り替え・削除は 404 で、監査ログに残さない", async () => {
    mockSetActive.mockResolvedValue(false);
    mockRemove.mockResolvedValue(false);

    const patch = await PATCH(
      jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "PATCH", { isActive: true }),
      userParams(USER_ID),
    );
    const remove = await DELETE(
      jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "DELETE"),
      userParams(USER_ID),
    );

    expect([patch.status, remove.status]).toEqual([404, 404]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("削除して、監査ログに残す", async () => {
    const response = await DELETE(
      jsonRequest(`http://localhost/api/admin/i2i-allowlist/${USER_ID}`, "DELETE"),
      userParams(USER_ID),
    );

    expect(response.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith(USER_ID);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "i2i_allowlist_remove", targetType: "i2i_catalog_allowlist" }),
    );
  });
});

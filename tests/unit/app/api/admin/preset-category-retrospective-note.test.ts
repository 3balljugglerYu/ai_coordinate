/** @jest-environment node */

/**
 * 企画の「所見」保存(PATCH /api/admin/preset-categories/[id])。
 *
 * 数字は自動で出せるが、そこから何を読み取ったかは人しか書けない。
 * ここで守りたいのは3点。
 *  - 管理者以外が書けないこと
 *  - 上限が API 側でも効くこと(UI の maxLength だけだと直叩きで無制限に書ける)
 *  - **更新時刻をクライアントから受け取らないこと**
 */

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/admin-audit", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("@/features/style-presets/lib/preset-category-repository", () => ({
  getPresetCategoryById: jest.fn(),
  updatePresetCategory: jest.fn(),
}));

// ルートは失効処理をローカル関数で持っている。Jest では no-op にする
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { PATCH } from "@/app/api/admin/preset-categories/[id]/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  getPresetCategoryById,
  updatePresetCategory,
} from "@/features/style-presets/lib/preset-category-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockGetById = getPresetCategoryById as jest.MockedFunction<
  typeof getPresetCategoryById
>;
const mockUpdate = updatePresetCategory as jest.MockedFunction<
  typeof updatePresetCategory
>;
const mockAudit = logAdminAction as jest.MockedFunction<typeof logAdminAction>;

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const EXISTING = {
  id: CATEGORY_ID,
  key: "fashion_magazine_summer",
  isCollectionSeries: true,
  completionThreshold: 8,
  completionViewMode: "book",
  mountTemplatePath: null,
  mountLayout: null,
  mountSlots: null,
  collectionDisplayStartsAt: "2026-08-08T10:00:00.000Z",
  collectionDisplayEndsAt: "2026-08-16T13:00:00.000Z",
  isActive: true,
} as unknown as Awaited<ReturnType<typeof getPresetCategoryById>>;

function buildRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/preset-categories/${CATEGORY_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const routeParams = { params: Promise.resolve({ id: CATEGORY_ID }) };

describe("PATCH /api/admin/preset-categories/[id] の所見", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as never);
    mockGetById.mockResolvedValue(EXISTING);
    mockUpdate.mockResolvedValue({
      ...(EXISTING as object),
      retrospectiveNote: "所見",
    } as never);
    mockAudit.mockResolvedValue(undefined as never);
  });

  test("所見を保存できる", async () => {
    const response = await PATCH(
      buildRequest({ retrospective_note: "離脱は最初の2枚に集中。" }),
      routeParams,
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      CATEGORY_ID,
      expect.objectContaining({
        retrospectiveNote: "離脱は最初の2枚に集中。",
        updatedBy: ADMIN_ID,
      }),
    );
  });

  test("監査ログに残る(履歴を持たない設計の保険)", async () => {
    await PATCH(buildRequest({ retrospective_note: "所見" }), routeParams);

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        actionType: "preset_category_update",
        targetId: CATEGORY_ID,
      }),
    );
  });

  /*
    UI の maxLength だけだと API 直叩きで無制限に書ける。
    DB の CHECK(4000)と同じ値で API 側でも弾く。
  */
  test("⭐4000文字を超えたら 400(DB の CHECK と同じ上限)", async () => {
    const response = await PATCH(
      buildRequest({ retrospective_note: "あ".repeat(4001) }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("ちょうど4000文字は通る", async () => {
    const response = await PATCH(
      buildRequest({ retrospective_note: "あ".repeat(4000) }),
      routeParams,
    );

    expect(response.status).toBe(200);
  });

  /*
    「消したつもりが空文字で残る」経路を作らない。
    DB 側は本文と更新時刻が対であることを CHECK で強制しているため、
    空文字のまま渡すと更新時刻だけ入った行ができてしまう。
  */
  test("⭐空白のみは null に正規化する", async () => {
    await PATCH(buildRequest({ retrospective_note: "  \n  " }), routeParams);

    expect(mockUpdate).toHaveBeenCalledWith(
      CATEGORY_ID,
      expect.objectContaining({ retrospectiveNote: null }),
    );
  });

  test("null を渡せば消せる", async () => {
    await PATCH(buildRequest({ retrospective_note: null }), routeParams);

    expect(mockUpdate).toHaveBeenCalledWith(
      CATEGORY_ID,
      expect.objectContaining({ retrospectiveNote: null }),
    );
  });

  test("文字列でも null でもなければ 400", async () => {
    const response = await PATCH(
      buildRequest({ retrospective_note: 123 }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  /*
    更新時刻はリポジトリがサーバー側で入れる。クライアントが送ってきても
    リポジトリへは渡さない(渡すと未来日時や過去日時を書き込めてしまう)。
  */
  test("⭐更新時刻はクライアントから受け取らない", async () => {
    await PATCH(
      buildRequest({
        retrospective_note: "所見",
        retrospective_note_updated_at: "2020-01-01T00:00:00.000Z",
      }),
      routeParams,
    );

    const payload = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("retrospectiveNoteUpdatedAt");
    expect(payload).not.toHaveProperty("retrospective_note_updated_at");
  });

  test("所見を送らなければ更新対象に含めない(他項目の編集を邪魔しない)", async () => {
    await PATCH(buildRequest({ is_active: true }), routeParams);

    const payload = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("retrospectiveNote");
  });

  test("管理者でなければ書けない", async () => {
    mockRequireAdmin.mockRejectedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await PATCH(
      buildRequest({ retrospective_note: "所見" }),
      routeParams,
    );

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

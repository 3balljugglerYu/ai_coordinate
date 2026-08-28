/** @jest-environment node */

/**
 * 企画ごとの「ワンポイントアドバイス」保存（PATCH /api/admin/preset-categories/[id]）。
 *
 * この文言は /style の生成画面に**そのまま出る**ので、API 側でも上限と型を
 * 守る必要がある（UI の maxLength だけでは直叩きで無制限に書ける）。
 */

jest.mock("@/lib/auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));
jest.mock("@/lib/admin-audit", () => ({ logAdminAction: jest.fn() }));
jest.mock("@/features/style-presets/lib/preset-category-repository", () => ({
  getPresetCategoryById: jest.fn(),
  updatePresetCategory: jest.fn(),
}));
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/admin/preset-categories/[id]/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  getPresetCategoryById,
  updatePresetCategory,
} from "@/features/style-presets/lib/preset-category-repository";
import { MAX_GENERATION_TIP_LENGTH } from "@/features/style-presets/lib/generation-tip";

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
  key: "travel_to_australia",
  isActive: true,
} as unknown as Awaited<ReturnType<typeof getPresetCategoryById>>;

function buildRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/preset-categories/${CATEGORY_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const routeParams = { params: Promise.resolve({ id: CATEGORY_ID }) };

describe("PATCH /api/admin/preset-categories/[id] のワンポイントアドバイス", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as never);
    mockGetById.mockResolvedValue(EXISTING);
    mockUpdate.mockResolvedValue(EXISTING as never);
    mockAudit.mockResolvedValue(undefined as never);
  });

  test("日本語と英語を保存できる", async () => {
    const response = await PATCH(
      buildRequest({
        generation_tip_ja: "  レンダリング品質を「バランス良く生成」に！  ",
        generation_tip_en: "Choose Balanced quality!",
      }),
      routeParams
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      CATEGORY_ID,
      expect.objectContaining({
        generationTipJa: "レンダリング品質を「バランス良く生成」に！",
        generationTipEn: "Choose Balanced quality!",
      })
    );
  });

  test("空文字は未設定（null）にする", async () => {
    await PATCH(buildRequest({ generation_tip_ja: "   " }), routeParams);

    expect(mockUpdate).toHaveBeenCalledWith(
      CATEGORY_ID,
      expect.objectContaining({ generationTipJa: null })
    );
  });

  test("null で明示的に消せる", async () => {
    await PATCH(buildRequest({ generation_tip_en: null }), routeParams);

    expect(mockUpdate).toHaveBeenCalledWith(
      CATEGORY_ID,
      expect.objectContaining({ generationTipEn: null })
    );
  });

  test("上限を超えたら 400", async () => {
    const response = await PATCH(
      buildRequest({
        generation_tip_ja: "あ".repeat(MAX_GENERATION_TIP_LENGTH + 1),
      }),
      routeParams
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("文字列以外は 400", async () => {
    const response = await PATCH(
      buildRequest({ generation_tip_ja: 123 }),
      routeParams
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("送らなければ触らない（既存の文言を消さない）", async () => {
    await PATCH(buildRequest({ display_name_ja: "名前だけ変更" }), routeParams);

    const payload = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("generationTipJa");
    expect(payload).not.toHaveProperty("generationTipEn");
  });
});

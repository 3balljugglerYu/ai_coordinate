/** @jest-environment node */

/**
 * GET /api/style-presets/[id]/summary。
 * ホームの「このカタログで生成する」(Persta ORIGINAL)がシートを開く前に呼ぶ。
 * 公開一覧に載るスタイルだけを返し、それ以外は区別せず 404 にする。
 */

jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePreset: jest.fn(),
}));

import { GET } from "@/app/api/style-presets/[id]/summary/route";
import { getPublishedStylePreset } from "@/features/style-presets/lib/get-public-style-presets";

const mockGet = getPublishedStylePreset as jest.Mock;

function call(id: string) {
  return GET(new Request(`http://localhost/api/style-presets/${id}/summary`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/style-presets/[id]/summary", () => {
  beforeEach(() => jest.clearAllMocks());

  test("公開中のスタイルは要約を返す(公開一覧と同じ取得。運営だけのカテゴリは含めない)", async () => {
    const preset = { id: "preset-1", slug: "summer-marine", title: "夏のマリンコーデ" };
    mockGet.mockResolvedValue(preset);

    const response = await call("preset-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preset });
    // 第2引数(includeAdminOnly)を渡さない = 公開分だけ
    expect(mockGet).toHaveBeenCalledWith("preset-1");
  });

  test("見つからない(未公開・運営だけ・存在しない)ときは 404", async () => {
    mockGet.mockResolvedValue(null);

    const response = await call("missing");

    expect(response.status).toBe(404);
  });

  test("取得に失敗したときは 500", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await call("preset-1");

    expect(response.status).toBe(500);
  });
});

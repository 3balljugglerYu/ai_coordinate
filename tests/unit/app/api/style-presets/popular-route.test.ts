/** @jest-environment node */

/**
 * GET /api/style-presets/popular。
 * アプリの「👑人気」タブの並び。生成数は返さず、公開中のスタイルの ID だけを多い順に返す。
 */

jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePresets: jest.fn(),
}));
jest.mock("@/features/style/lib/style-popularity", () => ({
  getStyleGenerateCounts: jest.fn(),
}));

import { GET } from "@/app/api/style-presets/popular/route";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { getStyleGenerateCounts } from "@/features/style/lib/style-popularity";

const mockPresets = getPublishedStylePresets as jest.Mock;
const mockCounts = getStyleGenerateCounts as jest.Mock;

describe("GET /api/style-presets/popular", () => {
  beforeEach(() => jest.clearAllMocks());

  test("生成数の多い順に並べ、0回のスタイルは含めない(同数は公開一覧の並び)", async () => {
    mockPresets.mockResolvedValue([
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ]);
    mockCounts.mockResolvedValue({ a: 3, b: 10, c: 3 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ presetIds: ["b", "a", "c"] });
    // 公開分だけ(運営だけのスタイルは含めない)
    expect(mockPresets).toHaveBeenCalledWith();
  });

  test("公開一覧に無い ID(未公開・運営だけ)は、生成数があっても出さない", async () => {
    mockPresets.mockResolvedValue([{ id: "a" }]);
    mockCounts.mockResolvedValue({ a: 1, hidden: 99 });

    const response = await GET();

    expect(await response.json()).toEqual({ presetIds: ["a"] });
  });

  test("生成数そのものは返さない", async () => {
    mockPresets.mockResolvedValue([{ id: "a" }]);
    mockCounts.mockResolvedValue({ a: 42 });

    const body = await (await GET()).json();

    expect(Object.keys(body)).toEqual(["presetIds"]);
    expect(JSON.stringify(body)).not.toContain("42");
  });

  test("取得に失敗したときは空の並び(人気タブが出ないだけ)", async () => {
    mockPresets.mockRejectedValue(new Error("boom"));
    mockCounts.mockResolvedValue({});
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ presetIds: [] });
  });
});

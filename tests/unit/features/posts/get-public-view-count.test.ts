/**
 * getPublicViewCount(👁表示元のフラグ切替)の回帰テスト。
 * (docs/planning/post-impressions-implementation-plan.md EARS-03)
 *
 * lib/env をモックするため、他の utils テストと分離した専用ファイルにしている。
 */

jest.mock("@/lib/env", () => ({
  isPostImpressionsEnabled: jest.fn(() => false),
}));

import { getPublicViewCount } from "@/features/posts/lib/utils";
import { isPostImpressionsEnabled } from "@/lib/env";

const mockFlag = isPostImpressionsEnabled as jest.MockedFunction<
  typeof isPostImpressionsEnabled
>;

describe("getPublicViewCount", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("フラグOFF: 従来の view_count を返す", () => {
    mockFlag.mockReturnValue(false);
    expect(getPublicViewCount({ view_count: 12, impression_count: 340 })).toBe(12);
  });

  it("フラグON: impression_count を返す", () => {
    mockFlag.mockReturnValue(true);
    expect(getPublicViewCount({ view_count: 12, impression_count: 340 })).toBe(340);
  });

  it("値が未定義/nullなら0にフォールバックする", () => {
    mockFlag.mockReturnValue(true);
    expect(getPublicViewCount({})).toBe(0);
    expect(getPublicViewCount({ impression_count: null })).toBe(0);

    mockFlag.mockReturnValue(false);
    expect(getPublicViewCount({ view_count: null })).toBe(0);
  });
});

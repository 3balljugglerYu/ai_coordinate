/** @jest-environment node */

/**
 * フィード CTA サマリの共有キャッシュ（ADR-005）。
 *
 * ここが誤ると (a) キー正規化が崩れてキャッシュに当たらない、
 * (b) 投稿取消・公開停止が反映されず「押せたのに作れない」になる。
 */

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
  revalidateTag: jest.fn(),
}));

import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import {
  PROMPT_ACTIONS_CACHE_TAG,
  normalizePromptActionPostIds,
  revalidatePromptActions,
} from "@/features/posts/lib/prompt-action-cache";

const mockCacheLife = cacheLife as jest.MockedFunction<typeof cacheLife>;
const mockCacheTag = cacheTag as jest.MockedFunction<typeof cacheTag>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;

const POST_A = "11111111-1111-4111-8111-111111111111";
const POST_B = "22222222-2222-4222-8222-222222222222";
const POST_C = "33333333-3333-4333-8333-333333333333";

describe("normalizePromptActionPostIds", () => {
  /*
    同じ投稿集合でも、順序が違うだけで別のキャッシュエントリになる。
    フィードの並びは全員同じでも、スクロール位置によって送る順序は変わり得る。
  */
  test("⭐並び順が違っても同じキーになる", () => {
    expect(normalizePromptActionPostIds([POST_C, POST_A, POST_B])).toEqual(
      normalizePromptActionPostIds([POST_A, POST_B, POST_C])
    );
  });

  test("⭐重複を除く(重複だけが違う集合も同じキーになる)", () => {
    expect(normalizePromptActionPostIds([POST_A, POST_A, POST_B])).toEqual(
      normalizePromptActionPostIds([POST_B, POST_A])
    );
  });

  test("中身は失われない", () => {
    expect(normalizePromptActionPostIds([POST_B, POST_A]).sort()).toEqual(
      [POST_A, POST_B].sort()
    );
  });

  test("空配列はそのまま空", () => {
    expect(normalizePromptActionPostIds([])).toEqual([]);
  });
});

describe("revalidatePromptActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("共有タグを失効させる", () => {
    revalidatePromptActions();

    expect(mockRevalidateTag).toHaveBeenCalledWith(PROMPT_ACTIONS_CACHE_TAG, "max");
  });

  test("失敗しても投げない(呼び出し元の投稿取消・判定を巻き添えにしない)", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRevalidateTag.mockImplementationOnce(() => {
      throw new Error("revalidate failed");
    });

    expect(() => revalidatePromptActions()).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("キャッシュの宣言", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("共有タグと minutes で宣言する(失効させる側とタグが揃っている)", async () => {
    /*
      require はモジュール評価を beforeEach の後にするため。
      getPromptActions は解決本体を呼ぶので、DB 到達前に落ちてよい
      （ここで見たいのは cacheTag/cacheLife の宣言だけ）。
    */
    const { getPromptActions } = await import(
      "@/features/posts/lib/prompt-action-cache"
    );

    await getPromptActions([POST_A]).catch(() => undefined);

    expect(mockCacheTag).toHaveBeenCalledWith(PROMPT_ACTIONS_CACHE_TAG);
    expect(mockCacheLife).toHaveBeenCalledWith("minutes");
  });
});

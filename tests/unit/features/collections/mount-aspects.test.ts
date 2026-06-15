import {
  DEFAULT_MOUNT_ASPECT,
  mountAspectForCategory,
} from "@/features/collections/lib/mount-aspects";

describe("mountAspectForCategory", () => {
  test("dims(実寸)が有効ならそれを最優先で使う", () => {
    expect(mountAspectForCategory("any_key", 1054, 1492)).toBe("1054 / 1492");
    // ハードコード表に在るカテゴリでも dims を優先
    expect(
      mountAspectForCategory("collectible_wafer_sticker_god_6p", 800, 600),
    ).toBe("800 / 600");
  });

  test("dims が無効/未指定ならハードコード表 → 既定値にフォールバック", () => {
    // 表に在るカテゴリ
    expect(mountAspectForCategory("collectible_wafer_sticker_god_6p")).toBe(
      "1024 / 1608",
    );
    // 表に無いカテゴリ → 既定値
    expect(mountAspectForCategory("unknown_key")).toBe(DEFAULT_MOUNT_ASPECT);
  });

  test("0/負/null/NaN の dims は無効として扱いフォールバックする", () => {
    expect(mountAspectForCategory("unknown_key", 0, 600)).toBe(
      DEFAULT_MOUNT_ASPECT,
    );
    expect(mountAspectForCategory("unknown_key", 800, -1)).toBe(
      DEFAULT_MOUNT_ASPECT,
    );
    expect(mountAspectForCategory("unknown_key", null, null)).toBe(
      DEFAULT_MOUNT_ASPECT,
    );
    expect(mountAspectForCategory("unknown_key", 800, undefined)).toBe(
      DEFAULT_MOUNT_ASPECT,
    );
  });
});

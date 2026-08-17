import {
  collectGeneratedImageStoragePaths,
  GENERATED_IMAGE_STORAGE_PATH_COLUMNS,
} from "@/features/generation/lib/generated-image-storage-paths";

describe("collectGeneratedImageStoragePaths", () => {
  test("1行が持つ4種のパスをすべて集める", () => {
    expect(
      collectGeneratedImageStoragePaths([
        {
          storage_path: "u/a.png",
          storage_path_display: "u/a_display.webp",
          storage_path_thumb: "u/a_thumb.webp",
          pre_generation_storage_path: "u/pre-generation/a.webp",
        },
      ]),
    ).toEqual([
      "u/a.png",
      "u/a_display.webp",
      "u/a_thumb.webp",
      "u/pre-generation/a.webp",
    ]);
  });

  test("null / undefined / 空文字は落とす", () => {
    expect(
      collectGeneratedImageStoragePaths([
        {
          storage_path: "u/a.png",
          storage_path_display: null,
          storage_path_thumb: undefined,
          pre_generation_storage_path: "",
        },
      ]),
    ).toEqual(["u/a.png"]);
  });

  test("同じパスは1回だけ返す(ワードローブ引き継ぎは3列が同一)", () => {
    const shared = "u/wardrobe.webp";
    expect(
      collectGeneratedImageStoragePaths([
        {
          storage_path: shared,
          storage_path_display: shared,
          storage_path_thumb: shared,
          pre_generation_storage_path: null,
        },
      ]),
    ).toEqual([shared]);
  });

  test("複数行をまたいで重複を除く", () => {
    expect(
      collectGeneratedImageStoragePaths([
        { storage_path: "u/a.png", storage_path_display: "u/shared.webp" },
        { storage_path: "u/b.png", storage_path_display: "u/shared.webp" },
      ]),
    ).toEqual(["u/a.png", "u/shared.webp", "u/b.png"]);
  });

  test("空配列では空を返す", () => {
    expect(collectGeneratedImageStoragePaths([])).toEqual([]);
  });

  test("SELECT 列リストに4列すべてが含まれる", () => {
    // 列を足したときにここが落ちれば、取り出し側の追従漏れに気づける。
    for (const column of [
      "storage_path",
      "storage_path_display",
      "storage_path_thumb",
      "pre_generation_storage_path",
    ]) {
      expect(GENERATED_IMAGE_STORAGE_PATH_COLUMNS).toContain(column);
    }
  });
});

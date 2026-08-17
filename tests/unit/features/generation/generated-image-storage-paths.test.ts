import {
  collectGeneratedImageStoragePaths,
  deriveGeneratedImageStoragePaths,
  GENERATED_IMAGE_STORAGE_PATH_COLUMNS,
  resolveGeneratedImageDeletablePaths,
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

describe("deriveGeneratedImageStoragePaths", () => {
  test("storage_path から _thumb / _display を導く", () => {
    expect(
      deriveGeneratedImageStoragePaths({ storage_path: "u/abc-0-xyz.png" }),
    ).toEqual(["u/abc-0-xyz_thumb.webp", "u/abc-0-xyz_display.webp"]);
  });

  test("user_id と id から Before 画像のパスを導く", () => {
    expect(
      deriveGeneratedImageStoragePaths({ id: "img-1", user_id: "u1" }),
    ).toEqual(["u1/pre-generation/img-1_display.webp"]);
  });

  test("拡張子が無い/複数ドットでも最後の拡張子だけを落とす", () => {
    expect(
      deriveGeneratedImageStoragePaths({ storage_path: "u/a.b.c.png" }),
    ).toEqual(["u/a.b.c_thumb.webp", "u/a.b.c_display.webp"]);
  });

  test("材料が無ければ何も導かない", () => {
    expect(deriveGeneratedImageStoragePaths({})).toEqual([]);
    expect(
      // id だけ / user_id だけでは Before 画像のパスは決まらない
      deriveGeneratedImageStoragePaths({ id: "img-1" }),
    ).toEqual([]);
  });
});

describe("resolveGeneratedImageDeletablePaths", () => {
  test("列が空でも導出したパスを消せる(SELECT後にuploadされた派生を拾う)", () => {
    // 派生は「upload → 列 UPDATE」の順に非同期で作られるため、
    // 削除側が行を読んだ時点では列が空のことがある。
    expect(
      resolveGeneratedImageDeletablePaths([
        {
          id: "img-1",
          user_id: "u1",
          storage_path: "u1/img-1.png",
          storage_path_display: null,
          storage_path_thumb: null,
          pre_generation_storage_path: null,
        },
      ]),
    ).toEqual([
      "u1/img-1.png",
      "u1/img-1_thumb.webp",
      "u1/img-1_display.webp",
      "u1/pre-generation/img-1_display.webp",
    ]);
  });

  test("列が埋まっていれば導出ぶんは重複として畳まれる", () => {
    expect(
      resolveGeneratedImageDeletablePaths([
        {
          id: "img-1",
          user_id: "u1",
          storage_path: "u1/img-1.png",
          storage_path_display: "u1/img-1_display.webp",
          storage_path_thumb: "u1/img-1_thumb.webp",
          pre_generation_storage_path: "u1/pre-generation/img-1_display.webp",
        },
      ]),
    ).toHaveLength(4);
  });
});

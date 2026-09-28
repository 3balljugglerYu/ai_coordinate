/** @jest-environment node */

import path from "node:path";
import { parseStylePresetManifest } from "@/scripts/style-presets/style-preset-manifest";

const BASE_DIR = path.join(path.sep, "work", "presets");

function parse(value: unknown) {
  return parseStylePresetManifest(JSON.stringify(value), BASE_DIR);
}

function errorsOf(result: ReturnType<typeof parse>): string {
  if (result.ok) {
    throw new Error("エラーになるはずが成功した");
  }
  return result.errors.join("\n");
}

const MINIMAL_ENTRY = {
  title: "Autumn Lakeside Wine Red Knit Look",
  image: "image.png",
  stylingPromptFile: "styling.txt",
};

describe("parseStylePresetManifest", () => {
  test("省略した項目は運営の標準(研究中のプロンプトに公開・並び順0)で埋め、パスはマニフェストの場所から解決する", () => {
    const result = parse([
      { ...MINIMAL_ENTRY, backgroundPromptFile: "sub/background.txt" },
    ]);

    expect(result).toEqual({
      ok: true,
      entries: [
        {
          title: "Autumn Lakeside Wine Red Knit Look",
          imagePath: path.join(BASE_DIR, "image.png"),
          stylingPromptPath: path.join(BASE_DIR, "styling.txt"),
          backgroundPromptPath: path.join(BASE_DIR, "sub", "background.txt"),
          categoryKey: "admin_preview",
          status: "published",
          // 既定で埋めた公開状態かどうか。既定の published が許されるのは、
          // 運営だけに見えるカテゴリのときだけ(登録時にカテゴリを見て確かめる)
          statusSpecified: false,
          sortOrder: 0,
        },
      ],
    });
  });

  test("カテゴリ・公開状態・並び順を明示すればそれを使い、絶対パスはそのまま使う", () => {
    const absoluteImage = path.join(path.sep, "elsewhere", "image.webp");

    const result = parse([
      {
        ...MINIMAL_ENTRY,
        image: absoluteImage,
        category: "coordinate_2",
        status: "draft",
        sortOrder: 5,
      },
    ]);

    expect(result).toEqual({
      ok: true,
      entries: [
        expect.objectContaining({
          imagePath: absoluteImage,
          categoryKey: "coordinate_2",
          status: "draft",
          statusSpecified: true,
          sortOrder: 5,
        }),
      ],
    });
  });

  test("並び順 0 を明示しても受け付ける", () => {
    const result = parse([{ ...MINIMAL_ENTRY, sortOrder: 0 }]);

    expect(result).toEqual({
      ok: true,
      entries: [expect.objectContaining({ sortOrder: 0 })],
    });
  });

  test("背景プロンプトは省略でき、そのときは null", () => {
    const result = parse([MINIMAL_ENTRY]);

    expect(result).toEqual({
      ok: true,
      entries: [expect.objectContaining({ backgroundPromptPath: null })],
    });
  });

  /*
    ⭐ 既定の公開状態 published は「運営だけに見える研究中のプロンプト」だから安全な既定。
    カテゴリを変えたのに公開状態が既定のままだと、一般公開のカテゴリへそのまま
    公開してしまう。カテゴリを変えるときは公開状態も書かせる。
  */
  test("カテゴリだけ指定して公開状態が無いと止める(一般公開のカテゴリへ誤って公開しないため)", () => {
    const result = parse([{ ...MINIMAL_ENTRY, category: "coordinate_2" }]);

    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("status");
  });

  // ⭐ 値ではなく「書いたかどうか」を持つ。published を明示したときも true
  test("published を明示したときも、明示したものとして扱う", () => {
    const result = parse([
      { ...MINIMAL_ENTRY, category: "coordinate_2", status: "published" },
    ]);

    expect(result).toEqual({
      ok: true,
      entries: [
        expect.objectContaining({
          categoryKey: "coordinate_2",
          status: "published",
          statusSpecified: true,
        }),
      ],
    });
  });

  test("公開状態だけの指定は、研究中のプロンプトにその状態で入れる", () => {
    const result = parse([{ ...MINIMAL_ENTRY, status: "draft" }]);

    expect(result).toEqual({
      ok: true,
      entries: [
        expect.objectContaining({
          categoryKey: "admin_preview",
          status: "draft",
          statusSpecified: true,
        }),
      ],
    });
  });

  test.each([
    ["壊れた JSON", "{not json"],
    ["配列でない", JSON.stringify(MINIMAL_ENTRY)],
    ["空の配列", JSON.stringify([])],
  ])("%s は拒否する", (_label, text) => {
    const result = parseStylePresetManifest(text, BASE_DIR);

    expect(result.ok).toBe(false);
    expect(errorsOf(result).length).toBeGreaterThan(0);
  });

  test("オブジェクトでない行は、例外にせず何件目かを示して拒否する", () => {
    const result = parseStylePresetManifest(
      JSON.stringify([MINIMAL_ENTRY, null]),
      BASE_DIR
    );

    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("2件目");
  });

  test("知らない項目名(打ち間違い)は、何件目のどの項目かを示して拒否する", () => {
    // ⭐ 正しい項目名(backgroundPromptFile)の一部ではない綴りにする。一部だと、
    //    許可する項目名の一覧を出すだけのエラーでも通ってしまう
    const result = parse([
      MINIMAL_ENTRY,
      { ...MINIMAL_ENTRY, title: "Second", backgroundPromtFile: "typo.txt" },
    ]);

    const errors = errorsOf(result);
    expect(errors).toContain("2件目");
    expect(errors).toContain("backgroundPromtFile");
  });

  /*
    ⭐ 並び順は管理 API より厳しい。管理画面は入力欄の値を整数に切り捨て、
    負の値は 0 に丸める(parse-style-preset-sort-order.ts)。マニフェストは
    手で書くものなので、黙って丸めると書き間違いが見えなくなる。止めて直させる。
  */
  test.each([
    ["不正な公開状態", { status: "public" }],
    ["負の並び順", { sortOrder: -1 }],
    ["小数の並び順", { sortOrder: 1.5 }],
    ["空のカテゴリ", { category: "", status: "draft" }],
    ["画像の指定が無い", { image: undefined }],
    ["画像の指定が空", { image: "" }],
    ["プロンプトの指定が無い", { stylingPromptFile: undefined }],
    ["背景プロンプトの指定が文字列でない", { backgroundPromptFile: 1 }],
    ["タイトルが文字列でない", { title: 1 }],
  ])("%s は拒否する", (_label, override) => {
    const result = parse([{ ...MINIMAL_ENTRY, ...override }]);

    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("1件目");
  });
});

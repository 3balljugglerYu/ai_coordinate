/** @jest-environment node */

import {
  applyTemplate,
  extractTemplateVariables,
} from "@/shared/generation/prompt-template";

describe("applyTemplate", () => {
  test("単一変数を置換する", () => {
    expect(applyTemplate("Hello {{name}}", { name: "Yu" })).toBe("Hello Yu");
  });

  test("複数変数を置換する", () => {
    expect(
      applyTemplate("Attempt {{attempt}} of {{max}}", {
        attempt: 2,
        max: 3,
      }),
    ).toBe("Attempt 2 of 3");
  });

  test("vars に無いキーはそのまま残る (silent 失敗回避)", () => {
    expect(applyTemplate("Hello {{name}}", { other: "x" })).toBe(
      "Hello {{name}}",
    );
  });

  test("vars に null / undefined を渡すとそのまま残る", () => {
    expect(
      applyTemplate("a={{a}} b={{b}}", { a: null, b: undefined }),
    ).toBe("a={{a}} b={{b}}");
  });

  test("空文字は置換される (= 空に変換)", () => {
    expect(applyTemplate("a={{x}}b", { x: "" })).toBe("a=b");
  });

  test("数値や 0 も置換できる", () => {
    expect(applyTemplate("count={{n}}", { n: 0 })).toBe("count=0");
  });

  test("変数が無いテキストはそのまま返す", () => {
    expect(applyTemplate("plain text", { foo: "bar" })).toBe("plain text");
  });

  test("同じ変数を複数回参照できる", () => {
    expect(applyTemplate("{{x}}-{{x}}", { x: "yo" })).toBe("yo-yo");
  });
});

describe("extractTemplateVariables", () => {
  test("テンプレート内の変数キーを抽出する", () => {
    expect(extractTemplateVariables("Attempt {{attempt}} of {{max}}")).toEqual([
      "attempt",
      "max",
    ]);
  });

  test("重複は 1 つにまとめる", () => {
    expect(extractTemplateVariables("{{x}} {{y}} {{x}}")).toEqual(["x", "y"]);
  });

  test("変数なしは空配列", () => {
    expect(extractTemplateVariables("no variables here")).toEqual([]);
  });
});

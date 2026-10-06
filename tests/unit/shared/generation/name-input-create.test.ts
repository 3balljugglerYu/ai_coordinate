import {
  applyNameInputCreate,
  prepareNameInputCreatePrompt,
} from "@/shared/generation/name-input-create";

const SLOT = { label: "名前", required: false };

describe("本文から名前の欄を作る(組み立て)", () => {
  test("名前の行を、最初の行の場所で目印1つにまとめる(ほかの行は言い換えない)", () => {
    const original = "【衣装】野菜のドレス\n【名前】〇〇\n※名前は変えない\n背景は畑";
    expect(applyNameInputCreate(original, { nameLines: [3, 2] }, SLOT)).toEqual({
      ok: true,
      body: "【衣装】野菜のドレス\n{{INPUT:名前}}\n背景は畑",
      removedLines: [2, 3],
    });
  });

  test("消した跡にできた空行の連なりは1つにする", () => {
    const original = "上\n\n【名前】〇〇\n\n※名前は変えない\n\n下";
    const result = applyNameInputCreate(original, { nameLines: [3, 4, 5] }, SLOT);
    expect(result).toMatchObject({ ok: true, body: "上\n\n{{INPUT:名前}}\n\n下" });
  });

  test("見出し・入力例・必須は、今の欄の設定で目印を作る", () => {
    const result = applyNameInputCreate(
      "描く\n名前：〇〇",
      { nameLines: [2] },
      { label: "うちの子", placeholder: "例：ぺるこ", required: true },
    );
    expect(result).toMatchObject({ ok: true, body: "描く\n{{INPUT*:うちの子|例：ぺるこ}}" });
  });

  test("名前の行が無ければ作れない", () => {
    expect(applyNameInputCreate("描く", { nameLines: [] }, SLOT)).toEqual({
      ok: false,
      reason: "no_name_lines",
    });
  });

  test("本文が目印だけになるなら作れない", () => {
    expect(applyNameInputCreate("【名前】〇〇", { nameLines: [1] }, SLOT)).toEqual({
      ok: false,
      reason: "empty_body",
    });
  });

  test.each([
    ["範囲外の行", [3]],
    ["0 行目", [0]],
    ["小数", [1.5]],
    ["文字列", ["1"]],
  ])("壊れた出力(%s)は作れない", (_label, nameLines) => {
    expect(applyNameInputCreate("描く\n名前", { nameLines }, SLOT)).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });

  test("配列でない出力は作れない", () => {
    expect(applyNameInputCreate("描く", { nameLines: "2" }, SLOT)).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });

  test("ガチャの囲みの行は消させない(ガチャが壊れるため)", () => {
    const original = "描く\n{{GACHA}}\n1. 医師\n{{/GACHA}}\n名前：〇〇";
    expect(applyNameInputCreate(original, { nameLines: [2, 5] }, SLOT)).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });

  test("道具に渡す前に、今ある目印は外す", () => {
    expect(prepareNameInputCreatePrompt("{{INPUT:名前}}\n描く\n")).toBe("描く");
  });
});

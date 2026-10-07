import {
  applyNameInputCreate,
  hasNameInputMarkerInBody,
  prepareNameInputCreatePrompt,
} from "@/shared/generation/name-input-create";

const SLOT = { label: "名前", required: false };
const none = { inlineLine: 0, inlineText: "" };

describe("本文から文字入力の欄を作る(組み立て)", () => {
  test("⭐同じ行に前後の文字があるときは、その部分だけを目印にし、「さん」などは残す(2026-10-07 報告)", () => {
    const original = [
      "プレートには、以下の2行の文字を表示する。",
      "1行目：「ぺるさん」",
      "2行目：「おめでとう！」",
      "名前の直後に必ず「さん」を付ける。",
      "入力された名前が「ぺる」の場合、1行目は必ず「ぺるさん」と表示する。",
    ].join("\n");
    const result = applyNameInputCreate(
      original,
      { inlineLine: 2, inlineText: "ぺる", removeLines: [5] },
      { label: "お祝いする相手の名前", placeholder: "ぺる", required: false },
    );
    expect(result).toEqual({
      ok: true,
      body: [
        "プレートには、以下の2行の文字を表示する。",
        "1行目：「{{INPUT:お祝いする相手の名前|ぺる}}さん」",
        "2行目：「おめでとう！」",
        "名前の直後に必ず「さん」を付ける。",
      ].join("\n"),
      removedLines: [5],
      changedLine: 2,
    });
  });

  test("見出しや入力のヒントに $ があっても、目印はそのまま入る(置き換えの記号として読まない)", () => {
    const result = applyNameInputCreate(
      "描く\n名札に「〇〇」と書く",
      { inlineLine: 2, inlineText: "〇〇", removeLines: [] },
      { label: "お題$'", placeholder: "a$$b", required: false },
    );
    expect(result).toMatchObject({ ok: true, body: "描く\n名札に「{{INPUT:お題$'|a$$b}}」と書く" });
  });

  test("差し込む行を消す行にも挙げられたら、差し込みを優先する", () => {
    const result = applyNameInputCreate("描く\n名札に「〇〇」と書く", { inlineLine: 2, inlineText: "〇〇", removeLines: [2] }, SLOT);
    expect(result).toMatchObject({ ok: true, body: "描く\n名札に「{{INPUT:名前}}」と書く", removedLines: [], changedLine: 2 });
  });

  test("差し込む場所が無ければ、消す行のうち最初の行の場所に目印を入れる(ほかの行は言い換えない)", () => {
    const original = "【衣装】野菜のドレス\n【名前】〇〇\n※名前は変えない\n背景は畑";
    expect(applyNameInputCreate(original, { ...none, removeLines: [3, 2] }, SLOT)).toEqual({
      ok: true,
      body: "【衣装】野菜のドレス\n{{INPUT:名前}}\n背景は畑",
      removedLines: [2, 3],
      changedLine: null,
    });
  });

  test("消した跡にできた空行の連なりは1つにする", () => {
    const original = "上\n\n【名前】〇〇\n\n※名前は変えない\n\n下";
    const result = applyNameInputCreate(original, { ...none, removeLines: [3, 4, 5] }, SLOT);
    expect(result).toMatchObject({ ok: true, body: "上\n\n{{INPUT:名前}}\n\n下" });
  });

  test("見出し・入力のヒントは、今の欄の設定で目印を作る", () => {
    const result = applyNameInputCreate(
      "描く\n名前：〇〇",
      { ...none, removeLines: [2] },
      { label: "うちの子", placeholder: "ぺるこ", required: false },
    );
    expect(result).toMatchObject({ ok: true, body: "描く\n{{INPUT:うちの子|ぺるこ}}" });
  });

  test("差し込む場所も消す行も無ければ作れない", () => {
    expect(applyNameInputCreate("描く", { ...none, removeLines: [] }, SLOT)).toEqual({
      ok: false,
      reason: "no_name_lines",
    });
  });

  test("本文が目印だけになるなら作れない", () => {
    expect(applyNameInputCreate("【名前】〇〇", { ...none, removeLines: [1] }, SLOT)).toEqual({
      ok: false,
      reason: "empty_body",
    });
  });

  test.each([
    ["範囲外の行", { ...none, removeLines: [3] }],
    ["0 行目", { ...none, removeLines: [0] }],
    ["小数", { ...none, removeLines: [1.5] }],
    ["文字列", { ...none, removeLines: ["1"] }],
    ["配列でない", { ...none, removeLines: "2" }],
    ["差し込む行が範囲外", { inlineLine: 9, inlineText: "名前", removeLines: [] }],
    ["差し込む文字がその行に無い", { inlineLine: 2, inlineText: "ぺる", removeLines: [] }],
    ["差し込む文字が空", { inlineLine: 2, inlineText: " ", removeLines: [] }],
    ["差し込む文字に波括弧", { inlineLine: 2, inlineText: "{名", removeLines: [] }],
  ])("壊れた出力(%s)は作れない", (_label, output) => {
    expect(applyNameInputCreate("描く\n{名前}", output, SLOT)).toEqual({ ok: false, reason: "invalid_output" });
  });

  test("ガチャの囲みの行は消させない・書き換えさせない(ガチャが壊れるため)", () => {
    const original = "描く\n{{GACHA}}\n1. 医師\n{{/GACHA}}\n名前：〇〇";
    expect(applyNameInputCreate(original, { ...none, removeLines: [2, 5] }, SLOT)).toEqual({
      ok: false,
      reason: "invalid_output",
    });
    expect(applyNameInputCreate(original, { inlineLine: 2, inlineText: "GACHA", removeLines: [] }, SLOT)).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });
});

describe("本文にもう目印があるか(あれば道具は要らない)", () => {
  test.each([
    ["文中に目印", "1行目：「{{INPUT:名前|ぺる}}さん」", true],
    ["2行目以降に目印だけの行", "描く\n{{INPUT:名前}}", true],
    ["スイッチで先頭に入った目印だけ", "{{INPUT:名前}}\n描く\n【名前】〇〇", false],
    ["先頭の目印＋文中の目印", "{{INPUT:名前}}\n1行目：「{{INPUT:名前}}さん」", true],
    ["目印なし", "描く", false],
    ["空の本文でスイッチ→同じ行に貼り付け", "{{INPUT:名前}}【名前】〇〇\n描く", false],
  ])("%s → %s", (_label, prompt, expected) => {
    expect(hasNameInputMarkerInBody(prompt)).toBe(expected);
  });

  test("道具に渡す前に、スイッチで先頭に入った目印は外す", () => {
    expect(prepareNameInputCreatePrompt("{{INPUT:名前}}\n描く\n")).toBe("描く");
  });
});

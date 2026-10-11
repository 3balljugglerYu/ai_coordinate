import { extractPromptOptions } from "@/shared/generation/prompt-options-extract";

const BOTH = { gacha: true, nameInput: true };

describe("貼り付けたガチャの囲み・文字入力の目印を欄へ移す(2026-10-11 案A)", () => {
  test("⭐「使用プロンプト」の形(先頭の目印＋本文＋末尾の囲み)を、本文と欄に分ける", () => {
    const pasted = "{{INPUT:なまえ|玲華}}\n名札に名前を書く。\n\n{{GACHA}}\n1. 医師\n2. 探偵\n{{/GACHA}}";
    expect(extractPromptOptions(pasted, BOTH)).toEqual({
      body: "名札に名前を書く。",
      gachaField: "{{GACHA}}\n1. 医師\n2. 探偵\n{{/GACHA}}",
      nameSlot: { label: "なまえ", placeholder: "玲華", required: false },
    });
  });

  test("ガチャの囲みが2つあれば、両方とも欄へ(書かれた順・空行でつなぐ)", () => {
    const pasted = "楽器を演奏する。\n\n{{GACHA}}\n1. ギター\n2. ドラム\n{{/GACHA}}\n\n{{GACHA}}\n1. 赤\n2. 青\n{{/GACHA}}";
    expect(extractPromptOptions(pasted, BOTH)).toMatchObject({
      body: "楽器を演奏する。",
      gachaField: "{{GACHA}}\n1. ギター\n2. ドラム\n{{/GACHA}}\n\n{{GACHA}}\n1. 赤\n2. 青\n{{/GACHA}}",
      nameSlot: null,
    });
  });

  test("文中の目印(「{{INPUT:名前}}さん」など)は動かさない", () => {
    expect(extractPromptOptions("1行目：「{{INPUT:名前}}さん」", BOTH)).toBeNull();
  });

  test("空のラベルの目印・必須の目印もそのまま読む", () => {
    expect(extractPromptOptions("{{INPUT:}}\n描く", BOTH)?.nameSlot).toEqual({ label: "", required: false });
    expect(extractPromptOptions("{{INPUT*:名前}}\n描く", BOTH)?.nameSlot).toEqual({ label: "名前", required: true });
  });

  test("目印だけを貼ったときは、本文は空になる", () => {
    expect(extractPromptOptions("{{INPUT:名前}}", BOTH)).toEqual({
      body: "",
      gachaField: null,
      nameSlot: { label: "名前", required: false },
    });
  });

  test("目印の行が複数あれば、最初の1つだけ移す(運営は2つ使える)", () => {
    expect(extractPromptOptions("{{INPUT:a}}\n描く\n{{INPUT:b}}", BOTH)).toMatchObject({
      body: "描く\n{{INPUT:b}}",
      nameSlot: { label: "a" },
    });
  });

  test("閉じていない囲み・打ちかけの目印は動かさない(打っている途中)", () => {
    expect(extractPromptOptions("描く\n{{GACHA}}\n1. 医師", BOTH)).toBeNull();
    expect(extractPromptOptions("描く\n{{INPUT:な", BOTH)).toBeNull();
  });

  test("使えない仕掛けは取り出さない", () => {
    const pasted = "{{INPUT:名前}}\n描く\n\n{{GACHA}}\n1. 医師\n2. 探偵\n{{/GACHA}}";
    expect(extractPromptOptions(pasted, { gacha: false, nameInput: false })).toBeNull();
    expect(extractPromptOptions(pasted, { gacha: false, nameInput: true })).toMatchObject({
      gachaField: null,
      nameSlot: { label: "名前" },
    });
  });

  test("何も無ければ null(本文はそのまま)", () => {
    expect(extractPromptOptions("描く", BOTH)).toBeNull();
  });
});

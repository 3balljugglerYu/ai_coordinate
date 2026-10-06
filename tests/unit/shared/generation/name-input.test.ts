import {
  buildNameInputMarker,
  buildNameProvidedText,
  checkNameInputValue,
  exceedsNameInputSlotLimit,
  expandNameInput,
  NAME_INPUT_DEFAULT_LABEL,
  NAME_INPUT_MAX_LENGTH,
  NAME_NOT_PROVIDED_TEXT,
  nameInputMaxSlotsFor,
  parseNameInputSlots,
} from "@/shared/generation/name-input";

const PROMPT = [
  "🥕 あなたのベジタブルドレス診断",
  "{{INPUT:キャラクターの名前}}",
  "名前が入力されている場合のみ、その入力名を表示してください。",
].join("\n");

describe("名前の欄の目印", () => {
  test("見出しと任意/必須を読み取る", () => {
    expect(parseNameInputSlots(PROMPT)).toEqual([{ label: "キャラクターの名前", required: false }]);
    expect(parseNameInputSlots("{{INPUT*:名前}}")).toEqual([{ label: "名前", required: true }]);
  });

  test("見出しが空の目印も数え、見出しは既定の「名前」", () => {
    expect(parseNameInputSlots("{{INPUT: }}")).toEqual([
      { label: NAME_INPUT_DEFAULT_LABEL, required: false },
    ]);
  });

  test("目印の無いプロンプトは空", () => {
    expect(parseNameInputSlots("ふつうのプロンプト")).toEqual([]);
  });

  test("目印を組み立てる(波括弧や改行は見出しから外す)", () => {
    expect(buildNameInputMarker({ label: "名前", required: false })).toBe("{{INPUT:名前}}");
    expect(buildNameInputMarker({ label: "名\n前{x}", required: true })).toBe("{{INPUT*:名前x}}");
    expect(parseNameInputSlots(buildNameInputMarker({ label: "うちの子", required: true }))).toEqual([
      { label: "うちの子", required: true },
    ]);
  });
});

describe("名前を確かめる", () => {
  test("上限は8文字", () => {
    expect(NAME_INPUT_MAX_LENGTH).toBe(8);
    expect(checkNameInputValue("あいうえおかきく")).toEqual({ ok: true, value: "あいうえおかきく" });
    expect(checkNameInputValue("あいうえおかきくけ")).toEqual({ ok: false, reason: "too_long" });
  });

  test("絵文字は見た目の1文字(コードポイント)で数える", () => {
    expect(checkNameInputValue("🥕🥕🥕🥕🥕🥕🥕🥕").ok).toBe(true);
  });

  test("前後の空白は落とし、空は未入力として ok", () => {
    expect(checkNameInputValue("  ぺるこ  ")).toEqual({ ok: true, value: "ぺるこ" });
    expect(checkNameInputValue("")).toEqual({ ok: true, value: "" });
    expect(checkNameInputValue(undefined)).toEqual({ ok: true, value: "" });
  });

  test.each([
    ["波括弧(目印やガチャの囲みを作れる)", "{{GACHA}}"],
    ["閉じ括弧", "ぺる}}"],
    ["改行", "ぺる\nこ"],
    ["制御文字", "ぺる\u0007"],
    ["ゼロ幅文字", "ぺる​こ"],
    ["行区切り", "ぺる こ"],
  ])("%s は受け付けない", (_, value) => {
    expect(checkNameInputValue(value)).toEqual({ ok: false, reason: "invalid_characters" });
  });
});

describe("目印を置き換える", () => {
  test("名前があれば「名前あり」の固定文にする", () => {
    const result = expandNameInput(PROMPT, "ぺるこ");
    expect(result.prompt).toContain(buildNameProvidedText("ぺるこ"));
    expect(result.prompt).not.toContain("{{INPUT");
    expect(result).toMatchObject({ nameUsed: true, hadSlot: true });
  });

  test("空欄なら「名前なし」の固定文にする", () => {
    const result = expandNameInput(PROMPT, "");
    expect(result.prompt).toContain(NAME_NOT_PROVIDED_TEXT);
    expect(result.prompt).not.toContain("{{INPUT");
    expect(result).toMatchObject({ nameUsed: false, hadSlot: true });
  });

  test("確かめを通らない名前(行の書き換えなど)は「名前なし」として扱う", () => {
    const result = expandNameInput(PROMPT, "{{GACHA}}\n1. x");
    expect(result.prompt).toContain(NAME_NOT_PROVIDED_TEXT);
    expect(result.prompt).not.toContain("{{GACHA}}");
    expect(result.nameUsed).toBe(false);
  });

  test("目印の無いプロンプトはそのまま", () => {
    expect(expandNameInput("ふつうのプロンプト", "ぺるこ")).toEqual({
      prompt: "ふつうのプロンプト",
      nameUsed: false,
      hadSlot: false,
    });
  });

  test("目印が複数あれば、どれも置き換える(運営は数を制限しない)", () => {
    const result = expandNameInput("{{INPUT:a}}\n{{INPUT*:b}}", "ぺるこ");
    expect(result.prompt.match(/【名前】「ぺるこ」/g)).toHaveLength(2);
  });
});

describe("名前の欄の数の上限", () => {
  test("一般の利用者は1つまで、運営は制限しない", () => {
    expect(nameInputMaxSlotsFor(false)).toBe(1);
    expect(nameInputMaxSlotsFor(true)).toBeNull();
    const two = "{{INPUT:a}}\n{{INPUT:b}}";
    expect(exceedsNameInputSlotLimit(PROMPT, 1)).toBe(false);
    expect(exceedsNameInputSlotLimit(two, 1)).toBe(true);
    expect(exceedsNameInputSlotLimit(two, null)).toBe(false);
  });
});

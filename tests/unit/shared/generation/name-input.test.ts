import {
  buildNameInputMarker,
  buildNameProvidedText,
  checkNameInputValue,
  countReachableNameInputSlots,
  describeNameInputForUsers,
  exceedsNameInputSlotLimit,
  expandNameInput,
  hasGuaranteedRequiredNameInput,
  NAME_INPUT_DEFAULT_LABEL,
  NAME_INPUT_MAX_LENGTH,
  buildNameNotProvidedText,
  nameInputMaxSlotsFor,
  parseNameInputSlots,
  removeNameInputMarkers,
  upsertNameInputMarker,
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
  test("文字があれば「文字あり」の固定文にし、見出しを入れる", () => {
    const result = expandNameInput(PROMPT, "ぺるこ");
    expect(result.prompt).toContain(buildNameProvidedText("ぺるこ", "キャラクターの名前"));
    expect(result.prompt).toContain("【キャラクターの名前】「ぺるこ」");
    expect(result.prompt).not.toContain("{{INPUT");
    expect(result).toMatchObject({ nameUsed: true, hadSlot: true });
  });

  test("空欄なら「文字なし」の固定文にし、その見出しの文字を作らせない", () => {
    const result = expandNameInput(PROMPT, "");
    expect(result.prompt).toContain(buildNameNotProvidedText("キャラクターの名前"));
    expect(result.prompt).toContain("【キャラクターの名前】未入力");
    expect(result.prompt).not.toContain("{{INPUT");
    expect(result).toMatchObject({ nameUsed: false, hadSlot: true });
  });

  test("確かめを通らない名前(行の書き換えなど)は「名前なし」として扱う", () => {
    const result = expandNameInput(PROMPT, "{{GACHA}}\n1. x");
    expect(result.prompt).toContain(buildNameNotProvidedText("キャラクターの名前"));
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
    expect(result.prompt).toContain("【a】「ぺるこ」");
    expect(result.prompt).toContain("【b】「ぺるこ」");
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

describe("ガチャと一緒に使ったときの数え方(Worker はガチャの後に置き換える)", () => {
  const gacha = (lines: string[]) => ["{{GACHA}}", ...lines, "{{/GACHA}}"].join("\n");

  test("候補ごとに1つなら、届くのは1つ(一般の利用者でも通る)", () => {
    const prompt = gacha(["1. 医師 {{INPUT:a}}", "2. 探偵 {{INPUT:b}}"]);
    expect(countReachableNameInputSlots(prompt)).toBe(1);
    expect(exceedsNameInputSlotLimit(prompt, 1)).toBe(false);
  });

  test("囲みの外と候補の中の両方にあれば、足して数える", () => {
    const prompt = `{{INPUT:a}}\n${gacha(["1. 医師 {{INPUT:b}}", "2. 探偵"])}`;
    expect(countReachableNameInputSlots(prompt)).toBe(2);
    expect(exceedsNameInputSlotLimit(prompt, 1)).toBe(true);
  });

  test("必須の欄が候補の中だけなら、空でも止めない(選ばれるか分からない)", () => {
    const prompt = gacha(["1. 医師 {{INPUT*:名前}}", "2. 探偵"]);
    expect(hasGuaranteedRequiredNameInput(prompt)).toBe(false);
  });

  test("必須の欄が囲みの外にあれば止める", () => {
    expect(hasGuaranteedRequiredNameInput(`{{INPUT*:名前}}\n${gacha(["1. a", "2. b"])}`)).toBe(true);
  });
});

describe("作る人の画面: 目印の入れ替え", () => {
  test("入力例は | の後ろに書く", () => {
    expect(parseNameInputSlots("{{INPUT:うちの子|例：ぺるこ}}")).toEqual([
      { label: "うちの子", required: false, placeholder: "例：ぺるこ" },
    ]);
    expect(buildNameInputMarker({ label: "うちの子", required: true, placeholder: "ぺるこ" })).toBe(
      "{{INPUT*:うちの子|ぺるこ}}",
    );
  });

  test("見出しを書き直している途中は、空のまま返せる", () => {
    expect(parseNameInputSlots("{{INPUT:}}", { keepEmptyLabel: true })[0].label).toBe("");
    expect(parseNameInputSlots("{{INPUT:}}")[0].label).toBe("名前");
  });

  test("目印が無ければ本文の先頭に1行で入れる", () => {
    expect(upsertNameInputMarker("診断", { label: "名前", required: false })).toBe("{{INPUT:名前}}\n診断");
    expect(upsertNameInputMarker("", { label: "名前", required: false })).toBe("{{INPUT:名前}}");
  });

  test("目印があれば、その場所で書き換える(最初の1つだけ)", () => {
    expect(
      upsertNameInputMarker("前\n【名前】{{INPUT:名前}}\n後 {{INPUT:別}}", { label: "うちの子", required: true }),
    ).toBe("前\n【名前】{{INPUT*:うちの子}}\n後 {{INPUT:別}}");
  });

  test("切ったら目印を消す(目印だけの行は行ごと)", () => {
    expect(removeNameInputMarkers("{{INPUT:名前}}\n診断\n【名前】{{INPUT*:x}}です")).toBe("診断\n【名前】です");
  });
});

describe("使う人に見せる名前の欄(本文は含めない)", () => {
  test("囲みの外の最初の欄の見出し・入力例・必須", () => {
    expect(describeNameInputForUsers("本文 {{INPUT*:うちの子|例：ぺるこ}}")).toEqual({
      label: "うちの子",
      placeholder: "例：ぺるこ",
      required: true,
    });
  });

  test("ガチャの候補の中だけなら、その見出しで任意", () => {
    const prompt = "{{GACHA}}\n1. 医師 {{INPUT*:名前}}\n2. 探偵\n{{/GACHA}}";
    expect(describeNameInputForUsers(prompt)).toEqual({ label: "名前", required: false });
  });

  test("欄が無ければ null", () => {
    expect(describeNameInputForUsers("ふつう")).toBeNull();
  });
});

describe("名前以外の文字(2026-10-07 汎用化)", () => {
  test("見出しが「好きな言葉」なら、固定文もその見出しで伝える(入力例は入れない)", () => {
    const result = expandNameInput("看板に書く\n{{INPUT:好きな言葉|例：一期一会}}", "一期一会");
    expect(result.prompt).toBe(`看板に書く\n${buildNameProvidedText("一期一会", "好きな言葉")}`);
    expect(result.prompt).not.toContain("例：");
  });

  test("目印ごとに自分の見出しを使う", () => {
    const result = expandNameInput("{{INPUT:名前}}\n{{INPUT:座右の銘}}", "");
    expect(result.prompt).toContain("【名前】未入力");
    expect(result.prompt).toContain("【座右の銘】未入力");
  });

  test("見出しが空なら既定の「名前」。見出しの【】は外す", () => {
    expect(expandNameInput("{{INPUT:}}", "a").prompt).toContain("【名前】「a」");
    expect(buildNameProvidedText("a", "【言葉】")).toContain("【言葉】「a」");
    expect(buildNameNotProvidedText("【】")).toContain("【名前】未入力");
  });
});


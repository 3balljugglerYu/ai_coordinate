import {
  GACHA_CLOSE_TAG,
  GACHA_FIELD_TEMPLATE,
  GACHA_MAX_CANDIDATES,
  GACHA_OPEN_TAG,
  GACHA_PICK_LEAD,
  exceedsGachaCandidateLimit,
  composeGachaPrompt,
  expandGachaPrompt,
  parseGachaCandidates,
  validateGachaField,
} from "@/shared/generation/gacha-prompt";

const BODY = "参照画像のキャラクターが、指定された職業を体験している様子を描く。";
const FIELD = [
  "【JOB】",
  "{{GACHA}}",
  "1. パティシエ。厨房でクリームを絞る",
  "2. 消防士。消防車の前でホースを構える",
  "3. 花屋。ブーケにリボンを結ぶ",
  "{{/GACHA}}",
].join("\n");

describe("parseGachaCandidates", () => {
  test("番号付きの行を候補として取り出す", () => {
    expect(parseGachaCandidates("1. 滑り台\n2. ブランコ\n")).toEqual([
      { number: 1, text: "滑り台" },
      { number: 2, text: "ブランコ" },
    ]);
  });

  test("中身のない番号だけの行は数えない（雛形のまま残った行）", () => {
    expect(parseGachaCandidates("1. 滑り台\n2. \n3. ブランコ\n4.")).toEqual([
      { number: 1, text: "滑り台" },
      { number: 3, text: "ブランコ" },
    ]);
  });

  test("次の番号までの行は同じ候補の続きにする", () => {
    expect(
      parseGachaCandidates("1. 夏の海辺\n水着とサンダル\n\n2. 冬の雪山"),
    ).toEqual([
      { number: 1, text: "夏の海辺\n水着とサンダル" },
      { number: 2, text: "冬の雪山" },
    ]);
  });

  test("全角のピリオドや読点の番号も受け付ける", () => {
    expect(parseGachaCandidates("1．滑り台\n2、ブランコ\n3) 鉄棒")).toEqual([
      { number: 1, text: "滑り台" },
      { number: 2, text: "ブランコ" },
      { number: 3, text: "鉄棒" },
    ]);
  });
});

describe("validateGachaField", () => {
  test("候補が2つ以上ある囲みは送れる", () => {
    expect(validateGachaField(FIELD)).toEqual({ ok: true, candidateCount: 3 });
  });

  test("雛形のままでは候補が足りない", () => {
    expect(validateGachaField(GACHA_FIELD_TEMPLATE)).toEqual({
      ok: false,
      reason: "too_few_candidates",
    });
  });

  test("候補が1つだけでは足りない", () => {
    expect(validateGachaField("{{GACHA}}\n1. 滑り台\n2. \n{{/GACHA}}")).toEqual({
      ok: false,
      reason: "too_few_candidates",
    });
  });

  test("囲みを消してしまったときは囲みが無いと分かる", () => {
    expect(validateGachaField("1. 滑り台\n2. ブランコ\n{{/GACHA}}")).toEqual({
      ok: false,
      reason: "missing_block",
    });
  });
});

describe("expandGachaPrompt", () => {
  const prompt = composeGachaPrompt(BODY, FIELD);

  test("選ばれた1つだけを前置きと一緒に残し、他の候補は送らない", () => {
    // 3候補のうち2番目（random=0.5 → index 1）
    const result = expandGachaPrompt(prompt, () => 0.5);

    expect(result.picks).toEqual([{ number: 2, total: 3 }]);
    expect(result.prompt).toBe(
      `${BODY}\n\n【JOB】\n${GACHA_PICK_LEAD}\n消防士。消防車の前でホースを構える`,
    );
    expect(result.prompt).not.toContain("パティシエ");
    expect(result.prompt).not.toContain("花屋");
    expect(result.prompt).not.toContain("{{GACHA}}");
  });

  test("乱数の両端でも候補の範囲から選ぶ", () => {
    expect(expandGachaPrompt(prompt, () => 0).picks).toEqual([
      { number: 1, total: 3 },
    ]);
    expect(expandGachaPrompt(prompt, () => 0.999999).picks).toEqual([
      { number: 3, total: 3 },
    ]);
    // Math.random は 1 を返さないが、渡された乱数が 1 でも範囲外へ出ない
    expect(expandGachaPrompt(prompt, () => 1).picks).toEqual([
      { number: 3, total: 3 },
    ]);
  });

  test("囲みの無いプロンプトはそのまま返す", () => {
    expect(expandGachaPrompt(BODY)).toEqual({ prompt: BODY, picks: [] });
  });

  test("中身のない囲みは、囲みの文字が届かないよう取り除く", () => {
    const result = expandGachaPrompt(
      composeGachaPrompt(BODY, GACHA_FIELD_TEMPLATE),
    );
    expect(result.picks).toEqual([]);
    expect(result.prompt.trim()).toBe(BODY);
  });

  test("囲みが複数あれば、それぞれから1つずつ選ぶ", () => {
    const result = expandGachaPrompt(
      "{{GACHA}}\n1. 海\n2. 山\n{{/GACHA}}\n{{GACHA}}\n1. 夏\n2. 冬\n3. 秋\n{{/GACHA}}",
      () => 0,
    );
    expect(result.picks).toEqual([
      { number: 1, total: 2 },
      { number: 1, total: 3 },
    ]);
    expect(result.prompt).toBe(
      `${GACHA_PICK_LEAD}\n海\n${GACHA_PICK_LEAD}\n夏`,
    );
  });

  test("毎回ランダムに選ぶ（既定の乱数で全候補が出うる）", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(expandGachaPrompt(prompt).picks[0].number);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe("候補の上限(10個)", () => {
  const block = (count: number) =>
    [GACHA_OPEN_TAG, ...Array.from({ length: count }, (_, i) => `${i + 1}. 候補${i + 1}`), GACHA_CLOSE_TAG].join("\n");

  test("上限は10個", () => {
    expect(GACHA_MAX_CANDIDATES).toBe(10);
  });

  test("ちょうど10個は送れる", () => {
    expect(validateGachaField(block(10))).toEqual({ ok: true, candidateCount: 10 });
    expect(exceedsGachaCandidateLimit(`本文\n\n${block(10)}`)).toBe(false);
  });

  test("11個は上限を超える", () => {
    expect(validateGachaField(block(11))).toEqual({ ok: false, reason: "too_many_candidates" });
    expect(exceedsGachaCandidateLimit(`本文\n\n${block(11)}`)).toBe(true);
  });

  test("中身のない番号だけの行は数えない", () => {
    const field = block(10).replace(GACHA_CLOSE_TAG, `11. \n12. \n${GACHA_CLOSE_TAG}`);
    expect(validateGachaField(field)).toEqual({ ok: true, candidateCount: 10 });
  });

  test("囲みが複数あるときは、どれか1つでも超えていれば止める", () => {
    expect(exceedsGachaCandidateLimit(`${block(3)}\n${block(11)}`)).toBe(true);
    expect(validateGachaField(`${block(3)}\n${block(11)}`)).toEqual({
      ok: false,
      reason: "too_many_candidates",
    });
  });

  test("囲みの無いプロンプトは止めない", () => {
    expect(exceedsGachaCandidateLimit("ふつうのプロンプト")).toBe(false);
  });
});

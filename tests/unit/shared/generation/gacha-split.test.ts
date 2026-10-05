import {
  applyGachaSplit,
  extractResponsesOutputText,
  numberPromptLines,
} from "@/shared/generation/gacha-split";
import { gachaLimitsFor, validateGachaField } from "@/shared/generation/gacha-prompt";

// 職業ガチャ(ChatGPT 向け)を短くしたもの
const ORIGINAL = [
  "【職業ガチャ】", // L1
  "アップロードされたキャラクターを使う。", // L2
  "このキャラクターに似合いそうな「職業」を、ランダムに1つだけ選んでください。", // L3
  "", // L4
  "例：", // L5
  "医師、パティシエ、天文学者、探偵など。", // L6
  "", // L7
  "その職業で実際に働いている瞬間を描く。", // L8
  "画像内に文字は入れない。", // L9
].join("\n");

describe("numberPromptLines", () => {
  test("各行に1始まりの番号を付ける(空行も数える)", () => {
    expect(numberPromptLines("a\n\nb")).toBe("L1: a\nL2: \nL3: b");
  });
});

describe("applyGachaSplit", () => {
  test("本文は元の行から消す行を除いただけ(言い換えない)", () => {
    const result = applyGachaSplit(ORIGINAL, {
      removeLines: [3, 5, 6],
      candidates: ["医師", "パティシエ", "天文学者", "探偵"],
    });

    expect(result).toEqual({
      ok: true,
      body: [
        "【職業ガチャ】",
        "アップロードされたキャラクターを使う。",
        "",
        "その職業で実際に働いている瞬間を描く。",
        "画像内に文字は入れない。",
      ].join("\n"),
      field: "{{GACHA}}\n1. 医師\n2. パティシエ\n3. 天文学者\n4. 探偵\n{{/GACHA}}",
      removedLines: [3, 5, 6],
      candidateCount: 4,
    });
    // 本文の行はすべて元の文の行
    if (result.ok) {
      const originalLines = new Set(ORIGINAL.split("\n"));
      for (const line of result.body.split("\n")) {
        expect(originalLines.has(line)).toBe(true);
      }
      expect(validateGachaField(result.field)).toEqual({
        ok: true,
        candidateCount: 4,
      });
    }
  });

  test("元の文に無い候補(AI が作り足したもの)は捨てる", () => {
    const result = applyGachaSplit(ORIGINAL, {
      removeLines: [3, 5, 6],
      // 「宇宙飛行士」は元の文に無い。「アップロード」は残す行(L2)にしか無い
      candidates: ["医師", "宇宙飛行士", "アップロード", "探偵"],
    });

    expect(result.ok && result.field).toBe("{{GACHA}}\n1. 医師\n2. 探偵\n{{/GACHA}}");
  });

  test("候補の番号・記号・改行・重複はそろえる", () => {
    const result = applyGachaSplit("本文\n1. 滑り台\n2. ブランコ\nジャングル\nジム", {
      removeLines: [2, 3, 4, 5],
      candidates: ["1. 滑り台", "・ブランコ", "ブランコ", "ジャングル\nジム"],
    });

    // 本文は残る(removeLines 空)ので field だけ見る
    expect(result.ok && result.field).toBe(
      "{{GACHA}}\n1. 滑り台\n2. ブランコ\n3. ジャングル ジム\n{{/GACHA}}",
    );
  });

  test("一覧の印(全角の番号・中黒)は外す", () => {
    const result = applyGachaSplit("本文\n1．医師\n2）探偵\n・写真家", {
      removeLines: [2, 3, 4],
      candidates: ["1．医師", "2）探偵", "・写真家"],
    });

    expect(result.ok && result.field).toBe(
      "{{GACHA}}\n1. 医師\n2. 探偵\n3. 写真家\n{{/GACHA}}",
    );
  });

  test("番号や記号で始まる候補そのものは削らない", () => {
    const result = applyGachaSplit("本文\n2.5Dイラスト、3、4人の家族、-5℃の雪原", {
      removeLines: [2],
      candidates: ["2.5Dイラスト", "3、4人の家族", "-5℃の雪原"],
    });

    expect(result.ok && result.field).toBe(
      "{{GACHA}}\n1. 2.5Dイラスト\n2. 3、4人の家族\n3. -5℃の雪原\n{{/GACHA}}",
    );
  });

  test("候補の並びが本文に残る(消す行に候補が無い)なら分けない", () => {
    // 「選んで」の行だけ消して、候補の並び(L6)を本文に残した出力
    expect(
      applyGachaSplit(ORIGINAL, {
        removeLines: [3],
        candidates: ["医師", "パティシエ", "天文学者", "探偵"],
      }),
    ).toEqual({ ok: false, reason: "no_candidates" });
  });

  test("元からある空行はそのまま、消した跡の空行だけ1つにする", () => {
    const result = applyGachaSplit("A\n\n\nB\n\n医師、探偵\n\nC", {
      removeLines: [6],
      candidates: ["医師", "探偵"],
    });

    expect(result.ok && result.body).toBe("A\n\n\nB\n\nC");
  });

  test("候補が2つ未満なら分けられない", () => {
    expect(
      applyGachaSplit(ORIGINAL, { removeLines: [], candidates: ["医師"] }),
    ).toEqual({ ok: false, reason: "no_candidates" });
    expect(
      applyGachaSplit(ORIGINAL, { removeLines: [], candidates: [] }),
    ).toEqual({ ok: false, reason: "no_candidates" });
  });

  test("全部の行を消すと本文が空になるので分けられない", () => {
    expect(
      applyGachaSplit("医師、探偵", {
        removeLines: [1],
        candidates: ["医師", "探偵"],
      }),
    ).toEqual({ ok: false, reason: "empty_body" });
  });

  test.each([
    ["範囲外の行番号", { removeLines: [99], candidates: ["医師", "探偵"] }],
    ["0 の行番号", { removeLines: [0], candidates: ["医師", "探偵"] }],
    ["小数の行番号", { removeLines: [1.5], candidates: ["医師", "探偵"] }],
    ["配列でない", { removeLines: "3", candidates: ["医師", "探偵"] }],
    ["文字列でない候補", { removeLines: [], candidates: ["医師", 3] }],
    ["候補が多すぎる", { removeLines: [], candidates: Array(101).fill("医師") }],
  ])("壊れた出力(%s)は分けない", (_label, output) => {
    expect(applyGachaSplit(ORIGINAL, output)).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });
});

describe("extractResponsesOutputText", () => {
  test("output[].content[] の output_text を取り出す", () => {
    expect(
      extractResponsesOutputText({
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "{\"a\":1}" }] },
        ],
      }),
    ).toBe("{\"a\":1}");
  });

  test("output_text が直接あればそれを使う", () => {
    expect(extractResponsesOutputText({ output_text: "x" })).toBe("x");
  });

  test("形が違えば null", () => {
    expect(extractResponsesOutputText(null)).toBeNull();
    expect(extractResponsesOutputText({ output: [{ content: [] }] })).toBeNull();
  });
});

describe("applyGachaSplit の候補の上限(10個)", () => {
  const items = (count: number) => Array.from({ length: count }, (_, i) => `職業${i + 1}`);
  const promptWith = (count: number) => `職業の制服を着て働く姿。\n職業は、${items(count).join("、")}のどれか。`;

  test("10個までなら分ける", () => {
    const result = applyGachaSplit(promptWith(10), { removeLines: [2], candidates: items(10) });
    expect(result.ok && result.candidateCount).toBe(10);
  });

  test("運営は11個以上でも分ける(上限を掛けない)", () => {
    const result = applyGachaSplit(
      promptWith(11),
      { removeLines: [2], candidates: items(11) },
      gachaLimitsFor(true),
    );
    expect(result.ok && result.candidateCount).toBe(11);
  });

  test("11個は勝手に削らず、上限を超えたとして分けない", () => {
    expect(applyGachaSplit(promptWith(11), { removeLines: [2], candidates: items(11) })).toEqual({
      ok: false,
      reason: "too_many_candidates",
    });
  });
});


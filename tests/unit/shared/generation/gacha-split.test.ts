import {
  applyGachaSplit,
  extractResponsesOutputText,
  numberPromptLines,
} from "@/shared/generation/gacha-split";
import { validateGachaField } from "@/shared/generation/gacha-prompt";

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
      candidates: ["医師", "宇宙飛行士", "探偵"],
    });

    expect(result.ok && result.field).toBe("{{GACHA}}\n1. 医師\n2. 探偵\n{{/GACHA}}");
  });

  test("候補の番号・記号・改行・重複はそろえる", () => {
    const result = applyGachaSplit("1. 滑り台\n2. ブランコ\nジャングル\nジム", {
      removeLines: [],
      candidates: ["1. 滑り台", "・ブランコ", "ブランコ", "ジャングル\nジム"],
    });

    // 本文は残る(removeLines 空)ので field だけ見る
    expect(result.ok && result.field).toBe(
      "{{GACHA}}\n1. 滑り台\n2. ブランコ\n3. ジャングル ジム\n{{/GACHA}}",
    );
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

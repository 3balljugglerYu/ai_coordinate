/** @jest-environment node */

import {
  extractResponsesApiText,
  unwrapCodeBlock,
  parseExtractedPrompt,
  looksLikeValidCreatorLooksPrompt,
} from "@/supabase/functions/extract-creator-looks-prompt/parse-output";

describe("extractResponsesApiText", () => {
  test("output_text サマリーがあれば直接返す", () => {
    expect(extractResponsesApiText({ output_text: "hello" })).toBe("hello");
  });

  test("output[].content[].text (= output_text type) を取り出す", () => {
    const payload = {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "extracted" }],
        },
      ],
    };
    expect(extractResponsesApiText(payload)).toBe("extracted");
  });

  test("type='text' のレガシー形状も拾う", () => {
    const payload = {
      output: [{ content: [{ type: "text", text: "legacy" }] }],
    };
    expect(extractResponsesApiText(payload)).toBe("legacy");
  });

  test("複数 output から最初の output_text を取る", () => {
    const payload = {
      output: [
        { type: "message", content: [{ type: "output_text", text: "first" }] },
        { type: "message", content: [{ type: "output_text", text: "second" }] },
      ],
    };
    expect(extractResponsesApiText(payload)).toBe("first");
  });

  test("output[] が無ければ null", () => {
    expect(extractResponsesApiText({ foo: "bar" })).toBeNull();
  });

  test("output[] の中に text type 要素が無ければ null", () => {
    const payload = {
      output: [
        {
          content: [{ type: "tool_call", text: "ignored" }],
        },
      ],
    };
    expect(extractResponsesApiText(payload)).toBeNull();
  });

  test("非 object / null / undefined は null", () => {
    expect(extractResponsesApiText(null)).toBeNull();
    expect(extractResponsesApiText(undefined)).toBeNull();
    expect(extractResponsesApiText("string")).toBeNull();
    expect(extractResponsesApiText(42)).toBeNull();
  });
});

describe("unwrapCodeBlock", () => {
  test("```\\n...\\n``` を取り除く", () => {
    expect(unwrapCodeBlock("```\nfoo\n```")).toBe("foo");
  });

  test("言語指定つき (= ```text\\n...\\n```) も取り除く", () => {
    expect(unwrapCodeBlock("```text\nfoo\nbar\n```")).toBe("foo\nbar");
  });

  test("複数行 + 末尾改行ありでも正しく中身を返す", () => {
    expect(unwrapCodeBlock("```\nline1\nline2\nline3\n```\n")).toBe(
      "line1\nline2\nline3",
    );
  });

  test("code block でないなら trim だけして返す", () => {
    expect(unwrapCodeBlock("  plain text  ")).toBe("plain text");
    expect(unwrapCodeBlock("no fence here")).toBe("no fence here");
  });

  test("``` 1 行だけ (= 改行なし) は空文字列", () => {
    expect(unwrapCodeBlock("```")).toBe("");
  });

  test("閉じが無い ``` 開きだけ → 残りを trim して返す", () => {
    expect(unwrapCodeBlock("```\nfoo")).toBe("foo");
  });
});

describe("parseExtractedPrompt", () => {
  test("コードブロックなしの output_text を直接返す", () => {
    const payload = {
      output_text: "CRITICAL INSTRUCTION:\nStyling Direction: ...\nBackground: ...",
    };
    expect(parseExtractedPrompt(payload)).toBe(
      "CRITICAL INSTRUCTION:\nStyling Direction: ...\nBackground: ...",
    );
  });

  test("output[] 形式 + コードブロックでラップされたケース", () => {
    const payload = {
      output: [
        {
          content: [
            {
              type: "output_text",
              text: "```\nCRITICAL INSTRUCTION:\nStyling Direction: Head: ...\nBackground: forest\nConstraints: keep pose\n```",
            },
          ],
        },
      ],
    };
    expect(parseExtractedPrompt(payload)).toBe(
      "CRITICAL INSTRUCTION:\nStyling Direction: Head: ...\nBackground: forest\nConstraints: keep pose",
    );
  });

  test("空文字 → null", () => {
    expect(parseExtractedPrompt({ output_text: "" })).toBeNull();
  });

  test("output が無い → null", () => {
    expect(parseExtractedPrompt({})).toBeNull();
  });

  test("コードブロックの中身が空 → null", () => {
    expect(parseExtractedPrompt({ output_text: "```\n\n```" })).toBeNull();
  });
});

describe("looksLikeValidCreatorLooksPrompt", () => {
  test("Styling Direction と Background を両方含めば true", () => {
    expect(
      looksLikeValidCreatorLooksPrompt(
        "Styling Direction:\nHead: nothing\nBackground: garden",
      ),
    ).toBe(true);
  });

  test("Styling Direction のみは false", () => {
    expect(
      looksLikeValidCreatorLooksPrompt("Styling Direction:\nHead: x"),
    ).toBe(false);
  });

  test("Background のみは false", () => {
    expect(looksLikeValidCreatorLooksPrompt("Background: forest")).toBe(false);
  });

  test("どちらも無いランダム文字列は false (= モデル暴走検知)", () => {
    expect(looksLikeValidCreatorLooksPrompt("hello, world")).toBe(false);
  });
});

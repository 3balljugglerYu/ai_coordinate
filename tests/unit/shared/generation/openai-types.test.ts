import { parseOpenAIImageUsage } from "@/shared/generation/openai-types";

/**
 * `/v1/images/edits` レスポンスの `usage` を camelCase の OpenAIImageUsage へ
 * 正規化する parser。Node / Deno の両クライアントが共有するので、ここで
 * 形の契約(欠損時の扱い)を固定する。
 */
describe("parseOpenAIImageUsage", () => {
  test("公式の usage 形(total/input/output + input_tokens_details)を camelCase に変換する", () => {
    expect(
      parseOpenAIImageUsage({
        total_tokens: 1300,
        input_tokens: 300,
        output_tokens: 1000,
        input_tokens_details: { text_tokens: 40, image_tokens: 260 },
      })
    ).toEqual({
      inputTokens: 300,
      outputTokens: 1000,
      totalTokens: 1300,
      inputTokensDetails: { textTokens: 40, imageTokens: 260 },
    });
  });

  test("total_tokens が無ければ input + output で補う", () => {
    expect(
      parseOpenAIImageUsage({ input_tokens: 300, output_tokens: 1000 })
    ).toEqual({
      inputTokens: 300,
      outputTokens: 1000,
      totalTokens: 1300,
      inputTokensDetails: null,
    });
  });

  test("input_tokens_details が欠けている/不完全なら inputTokensDetails=null にする", () => {
    expect(
      parseOpenAIImageUsage({
        input_tokens: 300,
        output_tokens: 1000,
        input_tokens_details: { text_tokens: 40 },
      })?.inputTokensDetails
    ).toBeNull();
    expect(
      parseOpenAIImageUsage({
        input_tokens: 300,
        output_tokens: 1000,
        input_tokens_details: "n/a",
      })?.inputTokensDetails
    ).toBeNull();
  });

  test("input_tokens / output_tokens が数値でなければ全体を null にする", () => {
    expect(
      parseOpenAIImageUsage({ input_tokens: "300", output_tokens: 1000 })
    ).toBeNull();
    expect(
      parseOpenAIImageUsage({ input_tokens: 300, output_tokens: Number.NaN })
    ).toBeNull();
    expect(parseOpenAIImageUsage({ output_tokens: 1000 })).toBeNull();
  });

  test("usage 自体が無い(undefined / null / 非オブジェクト)なら null", () => {
    expect(parseOpenAIImageUsage(undefined)).toBeNull();
    expect(parseOpenAIImageUsage(null)).toBeNull();
    expect(parseOpenAIImageUsage("usage")).toBeNull();
    expect(parseOpenAIImageUsage(42)).toBeNull();
  });
});

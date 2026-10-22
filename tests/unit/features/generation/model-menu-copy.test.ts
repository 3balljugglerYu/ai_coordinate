import { jaMessages as ja } from "@/messages/ja";

/**
 * 生成モデルのメニューの文言(2026-10-23 ユーザー承認)。
 *
 * - 品質の見出しは GPT も 2.1 も「品質」
 * - 品質の行は「速さの言葉：○秒程度で生成」。時間は本番の記録の実際の待ち時間
 * - 出力サイズの説明文は全モデルで同じ文
 * - 出力サイズの行は「名前：0.5K / 1K / 2K / 4K」。px は説明の吹き出しにだけ書く
 */
describe("生成モデルのメニューの文言(日本語)", () => {
  const c = ja.coordinate;

  it("品質の見出しは GPT も 2.1 も「品質」", () => {
    expect(c.gptImage2QualityLabel).toBe("品質");
    expect(c.nanoBanana21QualityLabel).toBe("品質");
  });

  it("品質の行の時間は、本番の記録に合わせる(2.5 と 2.0 で別の文言)", () => {
    expect([c.gptImage25QualityLow, c.gptImage25QualityMedium, c.gptImage25QualityHigh]).toEqual([
      "素早く生成：15秒程度で生成",
      "バランス良く生成：20秒程度で生成",
      "丁寧に生成：30秒程度で生成",
    ]);
    expect([c.gptImage2QualityLow, c.gptImage2QualityMedium, c.gptImage2QualityHigh]).toEqual([
      "素早く生成：20秒程度で生成",
      "バランス良く生成：40秒程度で生成",
      "丁寧に生成：180秒程度で生成",
    ]);
  });

  it("出力サイズの説明文は、GPT と Gemini で同じ", () => {
    expect(c.geminiBananaSizeDescription).toBe(c.gptImage2SizeDescription);
    expect(c.gptImage2SizeDescription).toBe("画像の向きに合わせて実サイズは自動調整されます。");
  });

  it("出力サイズの行は、全モデルで「名前：0.5K / 1K / 2K / 4K」(px を書かない)", () => {
    expect([c.gptImage2Size1k, c.gptImage2Size2k, c.gptImage2Size4k]).toEqual([
      "標準：1K",
      "高解像度：2K",
      "最高解像度：4K",
    ]);
    expect([c.geminiBananaSize05k, c.geminiBananaSize1k, c.geminiBananaSize2k, c.geminiBananaSize4k]).toEqual([
      "軽量：0.5K",
      "標準：1K",
      "高解像度：2K",
      "最高解像度：4K",
    ]);
  });
});

/**
 * ペルコイン消費量の表の、日時による切り替え(shared/generation/percoin-costs.ts)。
 *
 * 2026-10-23 のユーザー決定:
 * - 10/24 0:00 JST に改定(Nano 2 の値上げ・GPT 2.0 / 2.5 の見直し・2.1 の新しい値)
 * - 同じ日時から 11/30 23:59:59 JST まで、2.1 の 1K の素早く 10・バランス 20
 */
import {
  NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS,
  NANO_BANANA_2_1_PUBLIC_LAUNCH_AT_MS,
  PERCOIN_PRICE_REVISION_AT_MS,
  getPercoinCostTable,
} from "@/shared/generation/percoin-costs";
import { NANO_BANANA_2_1_CANONICAL_MODELS } from "@/shared/generation/gemini-banana-model";
import { OPENAI_IMAGE_CANONICAL_MODELS } from "@/shared/generation/openai-image-model";

const BEFORE = PERCOIN_PRICE_REVISION_AT_MS - 1;
const REVISED = PERCOIN_PRICE_REVISION_AT_MS;
const CAMPAIGN_LAST = NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS - 1;
const AFTER_CAMPAIGN = NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS;

describe("切り替えの日時", () => {
  it("改定と 2.1 の公開は 2026-10-24 0:00 JST、キャンペーンの終わりは 2026-12-01 0:00 JST", () => {
    expect(new Date(PERCOIN_PRICE_REVISION_AT_MS).toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(NANO_BANANA_2_1_PUBLIC_LAUNCH_AT_MS).toBe(PERCOIN_PRICE_REVISION_AT_MS);
    expect(new Date(NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS).toISOString()).toBe(
      "2026-11-30T15:00:00.000Z"
    );
  });
});

describe("getPercoinCostTable", () => {
  it("どの時刻の表にも、2.1 と GPT のすべてのモデルの値がある", () => {
    for (const atMs of [BEFORE, REVISED, AFTER_CAMPAIGN]) {
      const table = getPercoinCostTable(atMs);
      for (const model of [...NANO_BANANA_2_1_CANONICAL_MODELS, ...OPENAI_IMAGE_CANONICAL_MODELS]) {
        expect([atMs, model, typeof table[model]]).toEqual([atMs, model, "number"]);
      }
    }
  });

  it("改定の 1 ミリ秒前までは、今までの値", () => {
    const table = getPercoinCostTable(BEFORE);
    expect(table["gemini-3.1-flash-image-preview-512"]).toBe(10);
    expect(table["gemini-3.1-flash-image-preview-1024"]).toBe(20);
    expect(table["gemini-nano-banana-2.1-minimal-1k"]).toBe(20);
    expect(table["gemini-nano-banana-2.1-high-4k"]).toBe(140);
    expect(table["gpt-image-2.5-flare-high-1k"]).toBe(50);
    expect(table["gpt-image-2.5-flare-medium-2k"]).toBe(50);
    expect(table["gpt-image-2-high-2k"]).toBe(80);
  });

  it("改定の日時ちょうどから、新しい値とキャンペーンの値", () => {
    const table = getPercoinCostTable(REVISED);
    // Nano 2 は値上げ
    expect(table["gemini-3.1-flash-image-preview-512"]).toBe(20);
    expect(table["gemini-3.1-flash-image-preview-1024"]).toBe(30);
    // 2.1 の 1K の素早く・バランスだけキャンペーン(GPT 2.5 と同額)
    expect(table["gemini-nano-banana-2.1-minimal-1k"]).toBe(10);
    expect(table["gemini-nano-banana-2.1-medium-1k"]).toBe(20);
    expect(table["gemini-nano-banana-2.1-minimal-1k"]).toBe(table["gpt-image-2.5-flare-low-1k"]);
    expect(table["gemini-nano-banana-2.1-medium-1k"]).toBe(table["gpt-image-2.5-flare-medium-1k"]);
    // 丁寧と 2K 以上は通常価格
    expect(table["gemini-nano-banana-2.1-high-1k"]).toBe(40);
    expect(table["gemini-nano-banana-2.1-minimal-2k"]).toBe(30);
    expect(table["gemini-nano-banana-2.1-high-4k"]).toBe(80);
    // GPT
    expect(table["gpt-image-2.5-flare-high-1k"]).toBe(40);
    expect(table["gpt-image-2.5-flare-medium-2k"]).toBe(25);
    expect(table["gpt-image-2-high-2k"]).toBe(100);
  });

  it("キャンペーンの終わる 1 ミリ秒前までは、キャンペーンの値", () => {
    const table = getPercoinCostTable(CAMPAIGN_LAST);
    expect(table["gemini-nano-banana-2.1-minimal-1k"]).toBe(10);
    expect(table["gemini-nano-banana-2.1-medium-1k"]).toBe(20);
  });

  it("キャンペーンが終わったら、2.1 の 1K も通常価格(20・25)に戻り、ほかは変わらない", () => {
    const campaign = getPercoinCostTable(REVISED);
    const table = getPercoinCostTable(AFTER_CAMPAIGN);
    expect(table["gemini-nano-banana-2.1-minimal-1k"]).toBe(20);
    expect(table["gemini-nano-banana-2.1-medium-1k"]).toBe(25);
    const changed = Object.keys(table).filter((model) => table[model] !== campaign[model]);
    expect(changed.sort()).toEqual([
      "gemini-nano-banana-2.1-medium-1k",
      "gemini-nano-banana-2.1-minimal-1k",
    ]);
  });

  it("Nano Banana Pro と旧世代はどの時刻でも変わらない", () => {
    for (const atMs of [BEFORE, REVISED, AFTER_CAMPAIGN]) {
      const table = getPercoinCostTable(atMs);
      expect([
        table["gemini-2.5-flash-image"],
        table["gemini-3-pro-image-1k"],
        table["gemini-3-pro-image-2k"],
        table["gemini-3-pro-image-4k"],
      ]).toEqual([20, 50, 80, 100]);
    }
  });
});

/**
 * モデルごとのペルコイン消費量と、日時による表の切り替え。
 *
 * Next.js(残高の確認・画面の表示)と worker(実際の減算)の両方がこの関数を読む。
 * 表を変えたら worker のデプロイも必要。
 *
 * ## 2026-10-24 の改定と Nano Banana 2.1 の公開記念キャンペーン(2026-10-23 ユーザー決定)
 *
 * デプロイの時刻に左右されないよう、決まった日時で表を切り替える。
 *
 * - 〜 10/24 0:00 JST          : 改定前(今までの値)
 * - 10/24 0:00 〜 12/1 0:00 JST : 改定後 + 2.1 のキャンペーン(1K の素早く 10・バランス 20)
 * - 12/1 0:00 JST 〜           : 改定後の通常価格
 *
 * 改定の基準は 1pc あたりの原価 約 ¥0.2〜0.37(GPT 2.5 Low 1K の ¥0.31)。
 *
 * ⚠️ 判定に使う時刻は「その場の時刻」。worker でもジョブの `created_at` は使わない。
 * image_jobs の行は作成後も本人が書き換えられるので、過去の時刻にされると
 * 改定前やキャンペーンの値で引けてしまう。そのかわり、境目の数秒に作られたジョブだけは
 * 残高の確認と実際の減算で値がずれることがある。
 */

import { NANO_BANANA_2_1_PERCOIN_COSTS } from "./gemini-banana-model.ts";
import { OPENAI_IMAGE_PERCOIN_COSTS } from "./openai-image-model.ts";

/** 改定の日時(2026-10-24 0:00 JST)。Nano Banana 2.1 の一般公開も同じ日時。 */
export const PERCOIN_PRICE_REVISION_AT_MS = Date.parse(
  "2026-10-24T00:00:00+09:00"
);

/**
 * Nano Banana 2.1 を全員に公開する日時(改定と同じ瞬間)。
 * 生成の受け付け(`isNanoBanana21PubliclyEnabled`)と画面の行の両方がこれを見る。
 */
export const NANO_BANANA_2_1_PUBLIC_LAUNCH_AT_MS = PERCOIN_PRICE_REVISION_AT_MS;

/** 2.1 の公開記念キャンペーンが終わる日時(2026-12-01 0:00 JST。11/30 23:59:59 まで)。 */
export const NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS = Date.parse(
  "2026-12-01T00:00:00+09:00"
);

/** Nano Banana 2 / Pro と旧世代(改定後)。 */
const GEMINI_PERCOIN_COSTS = {
  "gemini-2.5-flash-image": 20,
  "gemini-3.1-flash-image-preview-512": 20,
  "gemini-3.1-flash-image-preview-1024": 30,
  "gemini-3-pro-image-1k": 50,
  "gemini-3-pro-image-2k": 80,
  "gemini-3-pro-image-4k": 100,
} as const;

/** 改定前の値。改定の日時を過ぎたら、このブロックごと消してよい。 */
const GEMINI_PERCOIN_COSTS_BEFORE_REVISION = {
  ...GEMINI_PERCOIN_COSTS,
  "gemini-3.1-flash-image-preview-512": 10,
  "gemini-3.1-flash-image-preview-1024": 20,
} as const;

const NANO_BANANA_2_1_PERCOIN_COSTS_BEFORE_REVISION = {
  "gemini-nano-banana-2.1-minimal-1k": 20,
  "gemini-nano-banana-2.1-minimal-2k": 30,
  "gemini-nano-banana-2.1-minimal-4k": 50,
  "gemini-nano-banana-2.1-medium-1k": 30,
  "gemini-nano-banana-2.1-medium-2k": 60,
  "gemini-nano-banana-2.1-medium-4k": 90,
  "gemini-nano-banana-2.1-high-1k": 60,
  "gemini-nano-banana-2.1-high-2k": 90,
  "gemini-nano-banana-2.1-high-4k": 140,
} as const satisfies Record<keyof typeof NANO_BANANA_2_1_PERCOIN_COSTS, number>;

const OPENAI_IMAGE_PERCOIN_COSTS_BEFORE_REVISION = {
  "gpt-image-2-low-1k": 10,
  "gpt-image-2-low-2k": 20,
  "gpt-image-2-low-4k": 40,
  "gpt-image-2-medium-1k": 20,
  "gpt-image-2-medium-2k": 50,
  "gpt-image-2-medium-4k": 80,
  "gpt-image-2-high-1k": 50,
  "gpt-image-2-high-2k": 80,
  "gpt-image-2-high-4k": 130,
  "gpt-image-2.5-flare-low-1k": 10,
  "gpt-image-2.5-flare-low-2k": 20,
  "gpt-image-2.5-flare-low-4k": 40,
  "gpt-image-2.5-flare-medium-1k": 20,
  "gpt-image-2.5-flare-medium-2k": 50,
  "gpt-image-2.5-flare-medium-4k": 80,
  "gpt-image-2.5-flare-high-1k": 50,
  "gpt-image-2.5-flare-high-2k": 80,
  "gpt-image-2.5-flare-high-4k": 130,
} as const satisfies Record<keyof typeof OPENAI_IMAGE_PERCOIN_COSTS, number>;

/** キャンペーン中だけ通常価格を上書きする(1K の素早く・バランス。GPT 2.5 と同額)。 */
const NANO_BANANA_2_1_LAUNCH_CAMPAIGN_COSTS = {
  "gemini-nano-banana-2.1-minimal-1k": 10,
  "gemini-nano-banana-2.1-medium-1k": 20,
} as const;

export type PercoinCostTable = Readonly<Record<string, number>>;

const PERCOIN_COSTS_BEFORE_REVISION: PercoinCostTable = {
  ...GEMINI_PERCOIN_COSTS_BEFORE_REVISION,
  ...NANO_BANANA_2_1_PERCOIN_COSTS_BEFORE_REVISION,
  ...OPENAI_IMAGE_PERCOIN_COSTS_BEFORE_REVISION,
};

const PERCOIN_COSTS: PercoinCostTable = {
  ...GEMINI_PERCOIN_COSTS,
  ...NANO_BANANA_2_1_PERCOIN_COSTS,
  ...OPENAI_IMAGE_PERCOIN_COSTS,
};

const PERCOIN_COSTS_DURING_CAMPAIGN: PercoinCostTable = {
  ...PERCOIN_COSTS,
  ...NANO_BANANA_2_1_LAUNCH_CAMPAIGN_COSTS,
};

/** その時刻に使うペルコイン消費量の表(キーは canonical のモデル名)。 */
export function getPercoinCostTable(atMs: number): PercoinCostTable {
  if (atMs < PERCOIN_PRICE_REVISION_AT_MS) {
    return PERCOIN_COSTS_BEFORE_REVISION;
  }
  if (atMs < NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS) {
    return PERCOIN_COSTS_DURING_CAMPAIGN;
  }
  return PERCOIN_COSTS;
}


/** 2.1 の公開記念キャンペーン中か(モデルの行の「お得！」バッジを出す期間)。 */
export function isNanoBanana21LaunchCampaignActive(atMs: number): boolean {
  return (
    atMs >= PERCOIN_PRICE_REVISION_AT_MS &&
    atMs < NANO_BANANA_2_1_LAUNCH_CAMPAIGN_ENDS_AT_MS
  );
}

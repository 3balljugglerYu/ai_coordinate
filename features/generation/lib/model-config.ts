/**
 * モデル設定とペルコイン消費量定義
 */

import {
  DEFAULT_GENERATION_MODEL,
  FALLBACK_GENERATION_MODEL,
  isKnownModelInput,
  isOpenAIImageModel,
  normalizeModelName,
  type GeminiModel,
} from "../types";
import {
  OPENAI_IMAGE_PERCOIN_COSTS,
  isGptImage25FlareModel,
} from "@/shared/generation/openai-image-model";
import type { CreatorLooksMode } from "@/shared/generation/creator-looks-mode";

export { DEFAULT_GENERATION_MODEL, FALLBACK_GENERATION_MODEL };

/**
 * Gemini 画像生成の kill switch。
 *
 * 何らかの理由で Gemini を全画面で一時停止したいとき（Google Cloud プロジェクト停止・
 * モデル不調・コスト問題など）に env を未設定 / `false` にして、全画面の Gemini 系
 * モデルを `isModelAvailableForGeneration()` でフィルタアウトする。
 *
 * 切替手順（必ず両方を揃えること）:
 *   - Next.js 側: Vercel の env に `NEXT_PUBLIC_GEMINI_GENERATION_ENABLED=true` を
 *     設定して再デプロイ（`NEXT_PUBLIC_*` はビルド時に bake-in される）。
 *   - Supabase Edge Function 側: `supabase secrets set GEMINI_GENERATION_ENABLED=true`
 *     のあと `supabase functions deploy image-gen-worker` を実行。
 *
 * テスト: kill ON / OFF 双方の挙動は `tests/unit/features/generation/inspire-model-config.test.ts`
 * で担保している。integration テストでも `jest.mock` で `GEMINI_GENERATION_ENABLED: true`
 * を上書きして enabled 経路を検証している。
 */
export const GEMINI_GENERATION_ENABLED =
  process.env.NEXT_PUBLIC_GEMINI_GENERATION_ENABLED === "true";

export function isGeminiImageModel(model: string | null | undefined): boolean {
  return typeof model === "string" && !isOpenAIImageModel(model);
}

export function isModelAvailableForGeneration(
  model: string | null | undefined
): boolean {
  if (!isKnownModelInput(model)) {
    return false;
  }
  const canonical = normalizeModelName(model);
  return (
    !isGeminiImageModel(canonical) || GEMINI_GENERATION_ENABLED
  );
}

/**
 * モデルごとのペルコイン消費量
 */
export const MODEL_PERCOIN_COSTS = {
  'gemini-2.5-flash-image': 20,
  'gemini-3.1-flash-image-preview-512': 10,
  'gemini-3.1-flash-image-preview-1024': 20,
  'gemini-3-pro-image-1k': 50,
  'gemini-3-pro-image-2k': 80,
  'gemini-3-pro-image-4k': 100,
  ...OPENAI_IMAGE_PERCOIN_COSTS,
} as const;

/**
 * 未ログインユーザーが選択可能な canonical モデル一覧。
 * UI で「南京錠」を出すかどうかと、サーバー側で 400 を返すかどうかの両方の正本。
 *
 * 注意: ここに含まれるのは canonical model（DB に保存される正規化済みの値）。
 * クライアントから受け取った生の入力に対しては `parseGuestRequestedModel()` を使うこと。
 */
const BASE_GUEST_ALLOWED_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low-1k',
  // ChatGPT Images 2.5 の Low も未ログインのお試しに開く。実測でペルコイン消費が
  // 同額かつ原価もほぼ同じ(2026-09-10: ¥3.58 と ¥3.59)で、生成時間だけが短い。
  // 2.5 の行そのものは段階公開フラグで制御されるため、ここを開けても
  // 公開前のゲストに 2.5 が見えるわけではない。
  'gpt-image-2.5-flare-low-1k',
  'gemini-3.1-flash-image-preview-512',
];

export const GUEST_ALLOWED_MODELS: ReadonlyArray<GeminiModel> =
  BASE_GUEST_ALLOWED_MODELS.filter(isModelAvailableForGeneration);

/**
 * canonical model がゲスト許可リストに含まれるか判定する。
 * 既に `normalizeModelName()` を通した値、または UI 上の `<Select>` の `value` を渡すこと。
 * 生の API 入力には `parseGuestRequestedModel()` を使う。
 */
export function isCanonicalGuestAllowedModel(
  model: string | null | undefined
): model is GeminiModel {
  return (
    typeof model === 'string' &&
    (GUEST_ALLOWED_MODELS as ReadonlyArray<string>).includes(model)
  );
}

/**
 * ログイン済み「free」プランユーザーが選択可能な canonical モデル一覧。
 * UI で南京錠を出すかどうかの正本（クリック時は SubscriptionUpsellDialog を開く）。
 *
 * 内訳:
 * - ChatGPT: Low / Medium × 1k（標準）まで。High と 2k/4k は有料プラン限定
 * - Nano Banana Pro: 1k（標準）のみ
 * - Nano Banana 2 ファミリー: 全 SKU 許可
 *
 * light / standard / premium プランは制限なし（このリストは無関係）。
 * ゲスト経路は GUEST_ALLOWED_MODELS で別途制限される。
 *
 * ## Medium を無課金にも開いている理由（2026-08-14）
 *
 * 実測した1ペルコインあたりの原価は、Medium(¥0.500〜0.647)が
 * **Low(¥0.342〜0.635)とほぼ同じ帯**に収まる。One-Tap Style は
 * 数千文字のプロンプトを送るため、Low でも入力ぶんが原価の7割を占め、
 * 長いプリセットでは Low のほうが割高になる逆転すら起きる。
 * つまり Medium を開けても原価の上限は実質的に動かない。
 * 一方でペルコインの消費は倍になり、出力の質も上がる。
 * 対して High は ¥0.642〜0.701 と一段高いので有料プラン限定のまま残す。
 * 根拠と測定手順は ADR-005（docs/planning/ai-cost-accuracy-and-medium-unlock-plan.md）。
 */
const BASE_FREE_PLAN_ALLOWED_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low-1k',
  'gpt-image-2-medium-1k',
  // ChatGPT Images 2.5 も 2.0 と同じ 2 つを無課金へ開く。ペルコイン消費が
  // 2.0 と同額である以上、無料枠だけ 2.0 に据え置くと「無課金だけ 2.5 が
  // 南京錠」という状態になるため揃える。段階公開中は 2.5 の行そのものが
  // 運営にしか出ないので、ここを開けても一般ユーザーへの影響は無い。
  'gpt-image-2.5-flare-low-1k',
  'gpt-image-2.5-flare-medium-1k',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview-512',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3-pro-image-1k',
];

export const FREE_PLAN_ALLOWED_MODELS: ReadonlyArray<GeminiModel> =
  BASE_FREE_PLAN_ALLOWED_MODELS.filter(isModelAvailableForGeneration);

/**
 * canonical model が free プラン許可リストに含まれるか判定する。
 * 認証済み free プランの `isModelSelectable` として LockableModelSelect / Quality /
 * Size セレクターに渡す。`null` / `undefined` / 未知文字列は false（ロック扱い）。
 */
export function isFreePlanAllowedModel(
  model: string | null | undefined
): model is GeminiModel {
  return (
    typeof model === 'string' &&
    (FREE_PLAN_ALLOWED_MODELS as ReadonlyArray<string>).includes(model)
  );
}

/**
 * クライアントから受け取った生の `model` 文字列をゲスト経路で安全に解釈する。
 *
 * - 既知のモデル入力（`KNOWN_MODEL_INPUTS`、エイリアス含む）に該当しない場合は `null`
 *   （`normalizeModelName()` が未知の値を既定モデルに丸めて誤って許可してしまうのを防ぐ）
 * - 既知ならば canonical へ正規化し、`GUEST_ALLOWED_MODELS` に含まれていれば canonical を返す
 * - 既知だがゲスト不許可なら `null`
 */
export function parseGuestRequestedModel(
  raw: string | null | undefined
): GeminiModel | null {
  if (!isKnownModelInput(raw)) {
    return null;
  }
  const canonical = normalizeModelName(raw);
  return isCanonicalGuestAllowedModel(canonical) ? canonical : null;
}

/**
 * UI state / localStorage に残ったモデルを、現在の認証状態で実際に使えるモデルへ丸める。
 *
 * ゲスト時は保存値そのものを書き換えず、送信・表示・料金表示で使う実効値だけを
 * FALLBACK_GENERATION_MODEL(常に 2.0)に clamp する。ログイン後は保存済みの選択をそのまま復元する。
 *
 * ChatGPT Images 2.5(gpt-image-2.5-flare)は段階公開中(REQ-014)。
 * `options.gptImage25Available`(`useGptImage25Available()` の値)が true のときだけ
 * 2.5 を実効値として通し、それ以外は FALLBACK_GENERATION_MODEL に丸める。
 * 省略時は false(fail closed)。運営が 2.5 を選んだ端末の localStorage を
 * 一般ユーザーが引き継ぐことは無いが、公開フラグを戻したときに残った保存値を
 * 送信させないためにここでも clamp する(実行はサーバー側の isGptImage25Available が正本)。
 */
export function resolveEffectiveModelForAuthState(
  model: GeminiModel,
  authState: "guest" | "authenticated",
  options: { gptImage25Available?: boolean } = {}
): GeminiModel {
  // ⚠️ 丸め先は DEFAULT ではなく FALLBACK(常に 2.0)。既定が 2.5 になった今、
  // DEFAULT へ丸めると「2.5 を 2.5 に丸める」になり、段階公開フラグを戻したときに
  // 一般ユーザーがサーバーのゲートで 400 になる。
  if (!isModelAvailableForGeneration(model)) {
    return FALLBACK_GENERATION_MODEL;
  }
  if (authState === "guest" && !isCanonicalGuestAllowedModel(model)) {
    return FALLBACK_GENERATION_MODEL;
  }
  if (isGptImage25FlareModel(model) && !options.gptImage25Available) {
    return FALLBACK_GENERATION_MODEL;
  }
  return model;
}

/**
 * サーバーが「モデルを自分で決める」ときの既定値。
 *
 * 使う場面は 2 つ。
 *   - リクエストに model が無い(後方互換)
 *   - カテゴリがモデル選択 UI を出さない(サーバー側で固定する)
 *
 * ⚠️ ここで素の `DEFAULT_GENERATION_MODEL`(= 2.5)を返してはいけない。
 * 段階公開フラグが OFF のとき、サーバー自身が選んだ 2.5 を自分のゲートで
 * 弾いて 400 にしてしまう(= その人は何をしても生成できない)。
 * **ユーザーが実際に実行できるモデルだけを選ぶ**のがこの関数の役目。
 *
 * ユーザーが明示的に 2.5 を送ってきた場合はこの関数を通さない。
 * そちらは従来どおりゲートで 400 にして「選べないものを選んだ」と伝える。
 */
export function resolveServerDefaultModel(
  gptImage25Available: boolean
): GeminiModel {
  return gptImage25Available
    ? DEFAULT_GENERATION_MODEL
    : FALLBACK_GENERATION_MODEL;
}

/**
 * URL クエリ(`/style?model=...`)で指定されたモデルを、先に選んでおいてよいか判定する。
 *
 * 告知バナーからの着地で「もう選んである」状態を作るための入口だが、
 * **URL は誰でも書き換えられる外部入力**なので、UI で選べないモデルを
 * ここで通してしまうと南京錠(ゲスト制限・無料プラン制限・段階公開)を
 * URL 一本で迂回できてしまう。
 *
 * 判定は「その人がセレクターで実際に選べるか」と同じ条件に揃える:
 *   1. 既知のモデル文字列か(未知・legacy 別名は canonical へ正規化)
 *   2. `resolveEffectiveModelForAuthState` を通して値が変わらないか
 *      (ゲスト許可・段階公開フラグ・kill switch)
 *   3. 無料プランなら `isFreePlanAllowedModel` に含まれるか
 *      (サーバー強制ではない UI 制限だが、URL で破れる状態は作らない)
 *
 * 通らなければ `null` を返す。呼び出し側は従来どおり localStorage の値を使う。
 */
export function resolveRequestedModelFromUrl(
  raw: string | null | undefined,
  authState: 'guest' | 'authenticated',
  options: { gptImage25Available?: boolean; isFreePlan?: boolean } = {}
): GeminiModel | null {
  if (!isKnownModelInput(raw)) {
    return null;
  }
  const canonical = normalizeModelName(raw);
  const effective = resolveEffectiveModelForAuthState(canonical, authState, {
    gptImage25Available: options.gptImage25Available,
  });
  if (effective !== canonical) {
    return null;
  }
  if (options.isFreePlan && !isFreePlanAllowedModel(canonical)) {
    return null;
  }
  return canonical;
}

/**
 * モデル名からペルコイン消費量を取得
 */
export function getPercoinCost(model: string | null | undefined): number {
  const normalized = normalizeModelName(model);
  return MODEL_PERCOIN_COSTS[normalized as keyof typeof MODEL_PERCOIN_COSTS] ?? 10;
}

/** Creator Looks の2段階(衣装＋背景)生成の割引率(1回ぶん×2に対して 10% 引き)。 */
export const CREATOR_LOOKS_TWO_STAGE_DISCOUNT = 0.9;

/**
 * Creator Looks 生成のモード別ペルコイン消費量。
 * - 衣装のみ / 背景のみ(1回): モデルコスト
 * - 衣装＋背景(2段階): ceil(モデルコスト × 2 × 0.9)
 * 残高チェック(API)と実消費(worker)で必ずこの関数を共用すること(不整合防止)。
 */
export function creatorLooksCost(
  model: string | null | undefined,
  mode: CreatorLooksMode,
): number {
  const base = getPercoinCost(model);
  if (mode === "outfit_and_background") {
    return Math.ceil(base * 2 * CREATOR_LOOKS_TWO_STAGE_DISCOUNT);
  }
  return base;
}

/**
 * Inspire 申請プレビュー生成で使うモデル（運営コスト最小化のため低解像度に固定）。
 * 申請者は同期 API でこの 2 モデルから 2 枚を並列生成し、結果を見てから申請を確定する。
 */
const BASE_INSPIRE_PREVIEW_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low-1k',
  'gemini-3.1-flash-image-preview-512',
];

export const INSPIRE_PREVIEW_MODELS: ReadonlyArray<GeminiModel> =
  BASE_INSPIRE_PREVIEW_MODELS.filter(isModelAvailableForGeneration);

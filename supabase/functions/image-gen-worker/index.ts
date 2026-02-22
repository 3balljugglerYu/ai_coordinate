// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";

/**
 * 画像生成ワーカー Edge Function
 * Supabase Queueからメッセージを読み取り、画像生成ジョブを処理
 */

const QUEUE_NAME = "image_jobs";
const VISIBILITY_TIMEOUT = 60; // 秒
const MAX_MESSAGES = 20; // 1回の読み取りで取得する最大メッセージ数
const STORAGE_BUCKET = "generated-images";
const PROCESSING_STALE_TIMEOUT_SECONDS = 360; // processing状態がこの秒数を超えたら異常とみなす

const INPUT_IMAGE_FETCH_MAX_ATTEMPTS = 3;
const INPUT_IMAGE_FETCH_RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

type InputImageData = {
  base64: string;
  mimeType: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchStatus(status: number): boolean {
  return INPUT_IMAGE_FETCH_RETRYABLE_STATUS.has(status);
}

function parseStorageObjectFromUrl(inputImageUrl: string): { bucket: string; objectPath: string } | null {
  try {
    const url = new URL(inputImageUrl);
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
    ];

    for (const marker of markers) {
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex === -1) continue;

      const rest = url.pathname.slice(markerIndex + marker.length);
      const [bucketRaw, ...pathParts] = rest.split("/");
      if (!bucketRaw || pathParts.length === 0) return null;

      return {
        bucket: decodeURIComponent(bucketRaw),
        objectPath: decodeURIComponent(pathParts.join("/")),
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function downloadInputImageFromUrlWithRetry(inputImageUrl: string): Promise<InputImageData> {
  let lastStatus: number | null = null;
  let lastStatusText = "";
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= INPUT_IMAGE_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(inputImageUrl);
      if (response.ok) {
        const imageBlob = await response.blob();
        const mimeType = imageBlob.type || "image/png";
        const arrayBuffer = await imageBlob.arrayBuffer();
        return {
          base64: encodeBase64(new Uint8Array(arrayBuffer)),
          mimeType,
        };
      }

      lastStatus = response.status;
      lastStatusText = response.statusText || "";
      if (!isRetryableFetchStatus(response.status)) {
        break;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < INPUT_IMAGE_FETCH_MAX_ATTEMPTS) {
      const backoffMs = 200 * attempt;
      await sleep(backoffMs);
    }
  }

  if (lastStatus !== null) {
    throw new Error(`URL download failed: ${lastStatus} ${lastStatusText}`.trim());
  }
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown error");
  throw new Error(`URL download failed: ${lastErrorMessage}`);
}

async function downloadInputImageViaStorageFallback(
  supabase: ReturnType<typeof createClient>,
  inputImageUrl: string
): Promise<InputImageData> {
  const location = parseStorageObjectFromUrl(inputImageUrl);
  if (!location) {
    throw new Error("Storage path could not be parsed from input_image_url");
  }

  const { data, error } = await supabase.storage
    .from(location.bucket)
    .download(location.objectPath);

  if (error || !data) {
    throw new Error(`Storage fallback download failed: ${error?.message ?? "Unknown error"}`);
  }

  const mimeType = data.type || "image/png";
  const arrayBuffer = await data.arrayBuffer();
  return {
    base64: encodeBase64(new Uint8Array(arrayBuffer)),
    mimeType,
  };
}

async function downloadInputImageViaStockFallback(
  supabase: ReturnType<typeof createClient>,
  sourceImageStockId: string
): Promise<InputImageData> {
  const { data: stock, error: stockError } = await supabase
    .from("source_image_stocks")
    .select("id, storage_path, image_url")
    .eq("id", sourceImageStockId)
    .maybeSingle();

  if (stockError) {
    throw new Error(`Stock lookup failed: ${stockError.message}`);
  }
  if (!stock) {
    throw new Error("Stock image not found");
  }

  let storagePathError = "";
  if (stock.storage_path) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(stock.storage_path);

    if (!error && data) {
      const mimeType = data.type || "image/png";
      const arrayBuffer = await data.arrayBuffer();
      return {
        base64: encodeBase64(new Uint8Array(arrayBuffer)),
        mimeType,
      };
    }
    storagePathError = error?.message ?? "Unknown error";
  }

  if (stock.image_url) {
    return await downloadInputImageViaStorageFallback(supabase, stock.image_url);
  }

  throw new Error(
    `Stock fallback failed: no usable source (storage_path_error=${storagePathError || "none"})`
  );
}

// 型定義
type GenerationType = "coordinate" | "specified_coordinate" | "full_body" | "chibi";
type GeminiModel = "gemini-2.5-flash-image" | "gemini-3-pro-image-1k" | "gemini-3-pro-image-2k" | "gemini-3-pro-image-4k";
type GeminiApiModel = "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * モデル名を正規化（データベース保存用）
 */
function normalizeModelName(model: string | null): GeminiModel {
  if (!model) {
    return "gemini-2.5-flash-image";
  }
  if (model === "gemini-2.5-flash-image-preview" || model === "gemini-2.5-flash-image") {
    return "gemini-2.5-flash-image";
  }
  if (model === "gemini-3-pro-image-preview" || model === "gemini-3-pro-image") {
    return "gemini-3-pro-image-2k";
  }
  if (model === "gemini-3-pro-image-1k" || model === "gemini-3-pro-image-2k" || model === "gemini-3-pro-image-4k") {
    return model as GeminiModel;
  }
  return "gemini-2.5-flash-image";
}

/**
 * データベース保存値をAPIエンドポイント名に変換
 */
function toApiModelName(model: GeminiModel): GeminiApiModel {
  if (model.startsWith("gemini-3-pro-image-")) {
    return "gemini-3-pro-image-preview";
  }
  return "gemini-2.5-flash-image";
}

/**
 * モデル名から画像サイズを抽出
 */
function extractImageSize(model: GeminiModel): "1K" | "2K" | "4K" | null {
  if (model === "gemini-3-pro-image-1k") return "1K";
  if (model === "gemini-3-pro-image-2k") return "2K";
  if (model === "gemini-3-pro-image-4k") return "4K";
  return null;
}

/**
 * モデル名からペルコインコストを取得
 */
function getPercoinCost(model: string | null): number {
  const normalized = normalizeModelName(model);
  const costs: Record<string, number> = {
    'gemini-2.5-flash-image': 20,
    'gemini-3-pro-image-1k': 50,
    'gemini-3-pro-image-2k': 80,
    'gemini-3-pro-image-4k': 100,
  };
  return costs[normalized] ?? 20;
}

/**
 * 再試行不可のエラーか判定
 */
function isNonRetriableGenerationError(errorMessage: string): boolean {
  return errorMessage === "No images generated";
}

/**
 * ペルコイン減算処理
 */
async function deductPercoinsFromGeneration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  generationId: string,
  percoinAmount: number
): Promise<void> {
  try {
    console.log(`[Percoin Deduction] Starting deduction for user ${userId}, job ${generationId}, amount ${percoinAmount}`);

    // 0. 既に減算済みかチェック（冪等性保証）
    const { data: existingConsumption, error: checkConsumptionError } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("transaction_type", "consumption")
      .eq("metadata->>job_id", generationId)
      .maybeSingle();

    if (checkConsumptionError) {
      console.error("[Percoin Deduction] Failed to check existing consumption:", checkConsumptionError);
      // チェック失敗時は処理を継続（減算漏れより二重減算回避を優先）
    }

    if (existingConsumption) {
      console.log(`[Percoin Deduction] Consumption already recorded for job ${generationId}, skipping`);
      return;
    }
    
    // 1. アカウントを取得
    // user_idはUNIQUE制約があるため、single()を使用してデータ整合性の問題を早期検出
    const { data: account, error: accountError } = await supabase
      .from("user_credits")
      .select("id, balance, paid_balance, promo_balance")
      .eq("user_id", userId)
      .single();
    
    let accountId: string;
    let currentBalance: number;
    let currentPaidBalance: number;
    let currentPromoBalance: number;
    
    if (accountError) {
      // レコードが存在しない場合（PGRST116）は新規作成
      // それ以外のエラー（複数レコードなど）はデータ整合性の問題として扱う
      if (accountError.code === 'PGRST116') {
        // アカウントが存在しない場合は作成
        const { data: created, error: insertError } = await supabase
          .from("user_credits")
          .insert({ user_id: userId, balance: 0, paid_balance: 0, promo_balance: 0 })
          .select("id, balance, paid_balance, promo_balance")
          .single();
        
        if (insertError || !created) {
          throw new Error(`ペルコインアカウントの初期化に失敗しました: ${insertError?.message}`);
        }
        
        accountId = created.id;
        currentBalance = created.balance;
        currentPaidBalance = created.paid_balance;
        currentPromoBalance = created.promo_balance;
      } else {
        // 複数レコードが存在する場合など、データ整合性の問題
        throw new Error(`ペルコイン残高の取得に失敗しました: ${accountError.message}`);
      }
    } else {
      accountId = account.id;
      currentBalance = account.balance;
      currentPaidBalance = account.paid_balance;
      currentPromoBalance = account.promo_balance;
    }
    
    console.log(`[Percoin Deduction] Current balance: ${currentBalance}, amount to deduct: ${percoinAmount}`);
    
    // 2. 残高チェックと消費内訳算出（無償 -> 有償）
    const fromPromo = Math.min(currentPromoBalance, percoinAmount);
    const fromPaid = percoinAmount - fromPromo;
    if (fromPaid > currentPaidBalance) {
      throw new Error(`ペルコイン残高が不足しています（現在: ${currentBalance}, 必要: ${percoinAmount}）`);
    }
    const newPromoBalance = currentPromoBalance - fromPromo;
    const newPaidBalance = currentPaidBalance - fromPaid;
    const newBalance = newPaidBalance + newPromoBalance;
    
    // 3. 残高を更新
    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        paid_balance: newPaidBalance,
        promo_balance: newPromoBalance,
        balance: newBalance,
      })
      .eq("id", accountId);
    
    if (updateError) {
      throw new Error(`ペルコイン残高の更新に失敗しました: ${updateError.message}`);
    }
    
    console.log(`[Percoin Deduction] Balance updated to: ${newBalance}`);
    
    // 4. 取引履歴を記録
    // 注意: related_generation_idは外部キー制約でgenerated_images.idを参照しているため、
    // 画像生成前はNULLでINSERTし、画像生成成功後にgenerated_images.idに更新する
    const { error: transactionError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: -percoinAmount,
        transaction_type: "consumption",
        related_generation_id: null, // 画像生成前はNULL（外部キー制約のため）
        metadata: { 
          reason: "image_generation", 
          source: "edge_function",
          job_id: generationId, // ジョブIDをmetadataに保存（後で更新するため）
          from_promo: fromPromo,
          from_paid: fromPaid,
        },
      });
    
    if (transactionError) {
      // 取引履歴の保存に失敗しても、残高は既に更新されているため、ログに記録のみ
      console.error("[Percoin Deduction] Failed to record credit transaction:", transactionError);
      throw new Error(`取引履歴の保存に失敗しました: ${transactionError.message}`);
    } else {
      console.log(`[Percoin Deduction] Transaction recorded successfully`);
    }
  } catch (error) {
    // エラーをログに記録して再throw
    console.error("[Percoin Deduction] Error deducting percoins:", error);
    throw error;
  }
}

/**
 * ペルコイン返金処理（冪等性保証付き）
 */
async function refundPercoinsFromGeneration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  jobId: string,
  percoinAmount: number
): Promise<void> {
  try {
    console.log(`[Percoin Refund] Starting refund for user ${userId}, job ${jobId}, amount ${percoinAmount}`);
    
    // 1. 既に返金済みかチェック（冪等性保証）
    const { data: existingRefund, error: checkError } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("transaction_type", "refund")
      .eq("metadata->>job_id", jobId) // metadata内のjob_idで検索
      .maybeSingle();
    
    if (checkError) {
      console.error("[Percoin Refund] Failed to check existing refund:", checkError);
      // チェックエラーでも処理を続行（重複返金のリスクはあるが、返金自体は重要）
    }
    
    if (existingRefund) {
      // 既に返金済みの場合は何もしない
      console.log(`[Percoin Refund] Refund already processed for job ${jobId}, skipping`);
      return;
    }

    // 2. 元の消費履歴を確認（存在しない場合は返金しない）
    const { data: consumptionTx, error: consumptionError } = await supabase
      .from("credit_transactions")
      .select("id, metadata")
      .eq("user_id", userId)
      .eq("transaction_type", "consumption")
      .eq("metadata->>job_id", jobId)
      .maybeSingle();

    if (consumptionError) {
      throw new Error(`消費履歴の確認に失敗しました: ${consumptionError.message}`);
    }

    if (!consumptionTx) {
      console.warn(`[Percoin Refund] Consumption transaction not found for job ${jobId}, skipping refund`);
      return;
    }
    
    // 3. アカウントを取得
    // user_idはUNIQUE制約があるため、single()を使用してデータ整合性の問題を早期検出
    // 返金処理では、既にペルコイン減算が行われている前提なので、レコードは存在するはず
    const { data: account, error: accountError } = await supabase
      .from("user_credits")
      .select("id, balance, paid_balance, promo_balance")
      .eq("user_id", userId)
      .single();
    
    let accountId: string;
    let currentBalance: number;
    let currentPaidBalance: number;
    let currentPromoBalance: number;
    
    if (accountError) {
      // レコードが存在しない場合（PGRST116）は新規作成（エッジケース対応）
      // それ以外のエラー（複数レコードなど）はデータ整合性の問題として扱う
      if (accountError.code === 'PGRST116') {
        // アカウントが存在しない場合は作成（通常は存在するはず）
        const { data: created, error: insertError } = await supabase
          .from("user_credits")
          .insert({ user_id: userId, balance: 0, paid_balance: 0, promo_balance: 0 })
          .select("id, balance, paid_balance, promo_balance")
          .single();
        
        if (insertError || !created) {
          throw new Error(`ペルコインアカウントの初期化に失敗しました: ${insertError?.message}`);
        }
        
        accountId = created.id;
        currentBalance = created.balance;
        currentPaidBalance = created.paid_balance;
        currentPromoBalance = created.promo_balance;
      } else {
        // 複数レコードが存在する場合など、データ整合性の問題
        throw new Error(`ペルコイン残高の取得に失敗しました: ${accountError.message}`);
      }
    } else {
      accountId = account.id;
      currentBalance = account.balance;
      currentPaidBalance = account.paid_balance;
      currentPromoBalance = account.promo_balance;
    }
    
    console.log(`[Percoin Refund] Current balance: ${currentBalance}, amount to refund: ${percoinAmount}`);
    
    // 4. 元の消費内訳を参照して返金先を決定
    const metadata = (consumptionTx?.metadata as { from_promo?: number; from_paid?: number } | null) ?? null;
    const refundToPromo = Math.max(0, Math.min(percoinAmount, Number(metadata?.from_promo ?? percoinAmount)));
    const refundToPaid = Math.max(0, percoinAmount - refundToPromo);

    // 5. 残高を増加
    const newPromoBalance = currentPromoBalance + refundToPromo;
    const newPaidBalance = currentPaidBalance + refundToPaid;
    const newBalance = newPromoBalance + newPaidBalance;
    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        paid_balance: newPaidBalance,
        promo_balance: newPromoBalance,
        balance: newBalance,
      })
      .eq("id", accountId);
    
    if (updateError) {
      throw new Error(`ペルコイン残高の更新に失敗しました: ${updateError.message}`);
    }
    
    console.log(`[Percoin Refund] Balance updated to: ${newBalance}`);
    
    // 6. 取引履歴を記録（transaction_type: "refund"）
    // 注意: related_generation_idは外部キー制約でgenerated_images.idを参照しているため、
    // 返金時はNULLでINSERTする（画像生成が失敗したため、generated_images.idは存在しない）
    const { error: transactionError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: percoinAmount,
        transaction_type: "refund",
        related_generation_id: null, // 画像生成失敗のためNULL
        metadata: { 
          reason: "image_generation_failed", 
          source: "edge_function",
          job_id: jobId, // ジョブIDをmetadataに保存
          to_promo: refundToPromo,
          to_paid: refundToPaid,
        },
      });
    
    if (transactionError) {
      if (transactionError.code === "23505") {
        console.log(`[Percoin Refund] Duplicate refund blocked by unique index for job ${jobId}`);
        return;
      }
      // 取引履歴の保存に失敗しても、残高は既に更新されているため、ログに記録のみ
      console.error("[Percoin Refund] Failed to record credit transaction:", transactionError);
    } else {
      console.log(`[Percoin Refund] Transaction recorded successfully`);
    }
  } catch (error) {
    // エラーをログに記録して再throw
    console.error("[Percoin Refund] Error refunding percoins:", error);
    throw error;
  }
}

/**
 * 背景変更の指示文を生成
 */
function getBackgroundDirective(shouldChangeBackground: boolean): string {
  return shouldChangeBackground
    ? "Adapt the background to match the new outfit's mood, setting, and styling, ensuring character lighting remains coherent."
    : "Keep the original background exactly as in the source image, editing only the outfit without altering the environment or lighting context.";
}

/**
 * プロンプトインジェクション対策: ユーザー入力をサニタイズ
 * - 制御文字の除去
 * - 複数の連続改行を統一（最大2つの連続改行まで許可）
 * - 禁止語句パターンの検出（基本的なインジェクション試行を防ぐ）
 */
function sanitizeUserInput(input: string): string {
  // トリム
  let sanitized = input.trim();
  
  // 制御文字を除去（タブ、改行以外の制御文字）
  // タブはスペースに変換、改行は後で処理
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // 複数の連続改行を最大2つまでに制限（3つ以上は2つに統一）
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // 禁止語句パターンの検出（基本的なプロンプトインジェクション試行）
  // より多くのインジェクションパターンを検出
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /override\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /system\s*:?\s*(prompt|instruction|command)/i,
    /<\|(system|user|assistant)\|>/i,
    // 追加パターン
    /you\s+are\s+(now|a|an)\s+/i,
    /act\s+as\s+(if\s+)?(you\s+are\s+)?/i,
    /pretend\s+(to\s+be|that\s+you\s+are)/i,
    /roleplay\s+as/i,
    /simulate\s+(being|that)/i,
    /\[(system|user|assistant|instruction|prompt)\]/i,
    /\{system\}/i,
    /\{user\}/i,
    /\{assistant\}/i,
    /#\s*(system|user|assistant|instruction|prompt)/i,
    /\/\*\s*(system|user|assistant|instruction|prompt)/i,
  ];
  
  // 禁止パターンが検出された場合はエラーをthrow（汎用的なエラーメッセージ）
  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error("無効な入力です。入力内容を確認してください。");
    }
  }
  
  // 再度トリム（処理後の余分な空白を削除）
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * プロンプトを構築（プロンプトインジェクション対策済み）
 */
function buildPrompt(
  generationType: GenerationType,
  outfitDescription: string,
  shouldChangeBackground: boolean
): string {
  // ユーザー入力をサニタイズ
  const sanitizedDescription = sanitizeUserInput(outfitDescription);
  
  // サニタイズ後の入力が空の場合は、エラーとする
  if (!sanitizedDescription || sanitizedDescription.length === 0) {
    throw new Error("無効な入力です。入力内容を確認してください。");
  }
  
  const backgroundDirective = getBackgroundDirective(shouldChangeBackground);

  // coordinateタイプのみ実装（他のタイプは後で拡張）
  if (generationType === "coordinate") {
    if (backgroundDirective.includes("Keep the original background")) {
      return `Edit **only the outfit** of the person in the image.

**New Outfit:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`;
    } else {
      return `Edit **only the outfit** of the person in the image, and **generate a new background that complements the new look**.

**New Outfit:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Make sure the updated background still feels cohesive with the character and shares the same illustration style as the original.`;
    }
  }

  // デフォルト（coordinateと同じ）
  return `Edit **only the outfit** of the person in the image.

**New Outfit:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`;
}

/**
 * Gemini APIレスポンスから画像データを抽出
 */
function extractImagesFromGeminiResponse(response: GeminiResponse): Array<{ mimeType: string; data: string }> {
  const images: Array<{ mimeType: string; data: string }> = [];

  if (!response.candidates) {
    return images;
  }

  for (const candidate of response.candidates) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      } else if (part.inline_data) {
        images.push({
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        });
      }
    }
  }

  return images;
}

/**
 * Data URLからBase64を抽出
 */
function extractBase64FromDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    return null;
  }
  return {
    mimeType: matches[1],
    base64: matches[2],
  };
}

Deno.serve(async () => {
  try {
    // 環境変数の取得
    // SUPABASE_URLは自動的に利用可能（Supabaseが提供）
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // SERVICE_ROLE_KEYは手動で設定する必要がある（SUPABASE_プレフィックスは使用不可）
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");

    // 環境変数のチェック（詳細なエラーメッセージを返す）
    if (!supabaseUrl) {
      console.error("Missing SUPABASE_URL environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing environment variable: SUPABASE_URL",
          message: "SUPABASE_URL should be automatically provided by Supabase"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!serviceRoleKey) {
      console.error("Missing SERVICE_ROLE_KEY environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing environment variable: SERVICE_ROLE_KEY",
          message: "Please set SERVICE_ROLE_KEY in Edge Function Secrets (not SUPABASE_SERVICE_ROLE_KEY)"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!geminiApiKey) {
      console.error("Missing GEMINI_API_KEY environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing environment variable: GEMINI_API_KEY",
          message: "Please set GEMINI_API_KEY or GOOGLE_AI_STUDIO_API_KEY in Edge Function Secrets"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Supabaseクライアント初期化（サービスロールキー使用）
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // キューからのメッセージ取得
    // 注意: PostgRESTはpublicとgraphql_publicスキーマのみを許可するため、
    // pgmq_public.read()の代わりにpublic.pgmq_read()ラッパー関数を使用
    let messages;
    let readError;
    
    try {
      const result = await supabase
        .rpc("pgmq_read", {
          p_queue_name: QUEUE_NAME,
          p_vt: VISIBILITY_TIMEOUT,
          p_qty: MAX_MESSAGES,
        });
      
      messages = result.data;
      readError = result.error;
    } catch (err) {
      console.error("Exception while reading from queue:", err);
      return new Response(
        JSON.stringify({ 
          error: "Exception while reading from queue",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (readError) {
      console.error("Failed to read from queue:", readError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to read from queue",
          details: readError.message || String(readError),
          code: readError.code,
          hint: readError.hint,
          queueName: QUEUE_NAME
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!messages || messages.length === 0) {
      // メッセージがない場合は正常終了
      return new Response(
        JSON.stringify({ processed: 0, message: "No messages in queue" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let processedCount = 0;
    let skippedCount = 0;

    // 各メッセージを処理
    for (const message of messages) {
      const msgId = message.msg_id;
      const jobId = message.message?.job_id;

      if (!jobId) {
        console.error("Message missing job_id:", message);
        // メッセージを削除してスキップ
        await supabase.rpc("pgmq_delete", {
          p_queue_name: QUEUE_NAME,
          p_msg_id: msgId,
        });
        continue;
      }

      try {
        // ジョブのステータスを取得（冪等性チェック）
        const { data: job, error: jobError } = await supabase
          .from("image_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

        if (jobError || !job) {
          console.error("Job not found:", jobId, jobError);
          // ジョブが見つからない場合はメッセージを削除
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          continue;
        }

        // 冪等性チェック: 既に完了している場合はメッセージを削除してスキップ
        if (job.status === "succeeded") {
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          skippedCount++;
          continue;
        }

        // processing中の場合は、スタック判定を行う
        if (job.status === "processing") {
          const startedAtMs = job.started_at ? new Date(job.started_at).getTime() : null;
          const nowMs = Date.now();
          const elapsedSeconds = startedAtMs ? Math.floor((nowMs - startedAtMs) / 1000) : Number.MAX_SAFE_INTEGER;
          const isStale = elapsedSeconds >= PROCESSING_STALE_TIMEOUT_SECONDS;

          if (!isStale) {
            // まだ他のワーカーが処理中の可能性があるため、メッセージは削除しない
            // （削除すると、クラッシュ時にジョブが永続的にprocessingになる）
            skippedCount++;
            continue;
          }

          // processingが長時間継続しているジョブは、通常の失敗判定フローに合流
          const newAttempts = (job.attempts || 0) + 1;
          const shouldMarkAsFailed = newAttempts >= 3;
          const staleErrorMessage = "処理がタイムアウトしました。入力画像サイズを下げて再試行してください。";
          const { data: staleUpdatedJob, error: staleUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: shouldMarkAsFailed ? "failed" : "queued",
              error_message: staleErrorMessage,
              attempts: newAttempts,
              started_at: shouldMarkAsFailed ? job.started_at : null,
              completed_at: shouldMarkAsFailed ? new Date().toISOString() : null,
            })
            .eq("id", jobId)
            .eq("status", "processing")
            .select("id")
            .maybeSingle();

          if (staleUpdateError) {
            console.error("Failed to mark stale processing job as failed:", staleUpdateError);
            // 更新できない場合はメッセージを削除しない（再試行）
            continue;
          }

          if (!staleUpdatedJob) {
            console.log(`[Job Processing] Stale update skipped because job state changed: ${jobId}`);
            skippedCount++;
            continue;
          }

          if (!shouldMarkAsFailed) {
            // 再試行可能なため、返金せずに次回ワーカー実行へ委譲
            skippedCount++;
            continue;
          }

          // 最終失敗確定時のみ返金（未減算ジョブの過剰返金も防ぐ）
          try {
            const { data: consumptionTx } = await supabase
              .from("credit_transactions")
              .select("id")
              .eq("user_id", job.user_id)
              .eq("transaction_type", "consumption")
              .eq("metadata->>job_id", jobId)
              .maybeSingle();

            if (consumptionTx) {
              const percoinCost = getPercoinCost(job.model);
              await refundPercoinsFromGeneration(
                supabase,
                job.user_id,
                jobId,
                percoinCost
              );
              console.log(`[Job Processing] Refunded ${percoinCost} percoins for final stale-failed job ${jobId}`);
            }
          } catch (refundError) {
            console.error("[Job Processing] Failed to refund final stale-failed job:", refundError);
          }

          // 失敗確定したためメッセージを削除
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          skippedCount++;
          continue;
        }

        // ステータスを'processing'に更新（排他制御）
        const { data: processingJob, error: updateError } = await supabase
          .from("image_jobs")
          .update({
            status: "processing",
            started_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .in("status", ["queued", "failed"]) // 既にprocessingの場合は更新しない
          .select("id")
          .maybeSingle();

        if (updateError) {
          console.error("Failed to update job status:", updateError);
          // 更新に失敗した場合は、次のメッセージを処理（可視性タイムアウト後に再処理される）
          continue;
        }

        if (!processingJob) {
          // 既に他ワーカーが状態を変更済み
          skippedCount++;
          continue;
        }

        // ===== ペルコイン減算処理（画像生成前に実行） =====
        try {
          const percoinCost = getPercoinCost(job.model);
          await deductPercoinsFromGeneration(
            supabase,
            job.user_id,
            jobId, // 一時的にjobIdを使用（画像生成後にgenerated_images.idに更新）
            percoinCost
          );
        } catch (deductError) {
          // ペルコイン減算失敗時はジョブを失敗としてマーク
          console.error("[Job Processing] Failed to deduct percoins:", deductError);
          const { data: deductionFailedJob, error: deductionFailUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: "failed",
              error_message: `ペルコイン減算に失敗しました: ${deductError instanceof Error ? deductError.message : String(deductError)}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .eq("status", "processing")
            .select("id")
            .maybeSingle();

          if (deductionFailUpdateError) {
            console.error("Failed to update job status after deduction failure:", deductionFailUpdateError);
            continue;
          }

          if (!deductionFailedJob) {
            skippedCount++;
            continue;
          }
          
          // メッセージを削除
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          
          continue; // 次のメッセージを処理
        }

        // ===== フェーズ4-1: Gemini API呼び出しの実装 =====
        try {
          // モデル名の正規化
          const dbModel = normalizeModelName(job.model);
          const apiModel = toApiModelName(dbModel);

          // リクエストボディを構築
          const parts: Array<{
            text?: string;
            inline_data?: {
              mime_type: string;
              data: string;
            };
          }> = [];

          // 元画像がある場合は追加
          if (job.input_image_url) {
            let inputImageData: InputImageData;

            // Data URL形式かStorage URLかを判定
            if (job.input_image_url.startsWith("data:")) {
              // Data URL形式の場合
              const imageData = extractBase64FromDataUrl(job.input_image_url);
              if (!imageData) {
                throw new Error("Invalid input image data URL");
              }
              inputImageData = {
                base64: imageData.base64,
                mimeType: imageData.mimeType,
              };
            } else {
              // URL取得が失敗しても、同じ画像をstorage APIから取得して再利用する
              try {
                inputImageData = await downloadInputImageFromUrlWithRetry(job.input_image_url);
              } catch (urlError) {
                const urlErrorMessage = urlError instanceof Error
                  ? urlError.message
                  : String(urlError);
                console.warn("[Input Image] URL download failed", {
                  jobId,
                  inputImageUrl: job.input_image_url,
                  sourceImageStockId: job.source_image_stock_id,
                  error: urlErrorMessage,
                });

                try {
                  inputImageData = await downloadInputImageViaStorageFallback(
                    supabase,
                    job.input_image_url
                  );
                  console.log("[Input Image] URL-derived storage fallback succeeded", {
                    jobId,
                    inputImageUrl: job.input_image_url,
                  });
                } catch (fallbackError) {
                  const fallbackErrorMessage = fallbackError instanceof Error
                    ? fallbackError.message
                    : String(fallbackError);
                  console.warn("[Input Image] URL-derived storage fallback failed", {
                    jobId,
                    inputImageUrl: job.input_image_url,
                    sourceImageStockId: job.source_image_stock_id,
                    error: fallbackErrorMessage,
                  });

                  if (job.source_image_stock_id) {
                    try {
                      inputImageData = await downloadInputImageViaStockFallback(
                        supabase,
                        job.source_image_stock_id
                      );
                      console.log("[Input Image] Stock fallback download succeeded", {
                        jobId,
                        sourceImageStockId: job.source_image_stock_id,
                      });
                    } catch (stockFallbackError) {
                      const stockFallbackErrorMessage = stockFallbackError instanceof Error
                        ? stockFallbackError.message
                        : String(stockFallbackError);
                      throw new Error(
                        `Failed to download input image. URL: ${urlErrorMessage}; url_fallback: ${fallbackErrorMessage}; stock_fallback: ${stockFallbackErrorMessage}`
                      );
                    }
                  } else {
                    throw new Error(
                      `Failed to download input image. URL: ${urlErrorMessage}; url_fallback: ${fallbackErrorMessage}; stock_fallback: skipped(no source_image_stock_id)`
                    );
                  }
                }
              }
            }

            parts.push({
              inline_data: {
                mime_type: inputImageData.mimeType,
                data: inputImageData.base64,
              },
            });
          }

          // プロンプトを構築
          const fullPrompt = job.input_image_url
            ? buildPrompt(job.generation_type as GenerationType, job.prompt_text, job.background_change)
            : job.prompt_text;

          parts.push({
            text: fullPrompt,
          });

          // リクエストボディ
          const requestBody: {
            contents: Array<{
              parts: typeof parts;
            }>;
            generationConfig?: {
              candidateCount?: number;
              imageConfig?: {
                imageSize?: "1K" | "2K" | "4K";
              };
            };
          } = {
            contents: [
              {
                parts,
              },
            ],
          };

          // Gemini 3 Pro Image Previewの場合、imageConfigを追加
          if (apiModel === "gemini-3-pro-image-preview") {
            const imageSize = extractImageSize(dbModel);
            if (imageSize) {
              requestBody.generationConfig = {
                ...requestBody.generationConfig,
                imageConfig: {
                  imageSize: imageSize,
                },
              };
            }
          }

          // APIエンドポイントURLを構築
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;

          const maxAttempts = 2; // 初回 + 1回リトライ
          let generatedImage: { mimeType: string; data: string } | null = null;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            // Gemini APIを呼び出し
            const geminiResponse = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiApiKey,
              },
              body: JSON.stringify(requestBody),
            });

            if (!geminiResponse.ok) {
              const errorData = await geminiResponse.json();
              throw new Error(errorData.error?.message || `Gemini API error: ${geminiResponse.status}`);
            }

            const geminiData: GeminiResponse = await geminiResponse.json();

            if (geminiData.error) {
              throw new Error(geminiData.error.message || "Gemini API error");
            }

            // 画像データを抽出
            const images = extractImagesFromGeminiResponse(geminiData);

            if (images.length > 0) {
              generatedImage = images[0];
              break;
            }

            // 画像が返ってこなかった場合、リトライ可能なら再試行
            if (attempt < maxAttempts) {
              console.log(`[Job Processing] No images generated (attempt ${attempt}/${maxAttempts}), retrying...`);
            } else {
              throw new Error("No images generated");
            }
          }

          if (!generatedImage) {
            throw new Error("No images generated");
          }

          // 最初の画像を使用（複数生成の場合は1枚目を使用）

          // ===== フェーズ4-2: Supabase Storageへの画像保存 =====
          // Base64をUint8Arrayに変換
          const base64Data = generatedImage.data;
          const byteArray = decodeBase64(base64Data);

          // ファイル名を生成（ユーザーID + タイムスタンプ + ランダム文字列）
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 15);
          
          // MIMEタイプから安全な拡張子を取得（パストラバーサル対策）
          const getSafeExtension = (mimeType: string): string => {
            // 許可されたMIMEタイプのマッピング
            const allowedMimeTypes: Record<string, string> = {
              "image/png": "png",
              "image/jpeg": "jpg",
              "image/jpg": "jpg",
              "image/webp": "webp",
              "image/gif": "gif",
            };
            
            // MIMEタイプを正規化（小文字、前後の空白をトリム）
            const normalizedMimeType = mimeType.toLowerCase().trim();
            
            // 許可されたMIMEタイプか確認
            if (normalizedMimeType in allowedMimeTypes) {
              return allowedMimeTypes[normalizedMimeType];
            }
            
            // 許可されていない場合はデフォルトの拡張子を使用
            return "png";
          };
          
          const extension = getSafeExtension(generatedImage.mimeType);
          const fileName = `${job.user_id}/${timestamp}-${randomStr}.${extension}`;

          // Supabase Storageにアップロード
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(fileName, byteArray, {
              contentType: generatedImage.mimeType,
              upsert: false,
            });

          if (uploadError) {
            console.error("Storage upload error:", uploadError);
            throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
          }

          // 公開URLを取得
          const {
            data: { publicUrl },
          } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);

          // ===== フェーズ4-3: generated_imagesテーブルへの保存 =====
          const { data: imageRecord, error: insertError } = await supabase
            .from("generated_images")
            .insert({
              user_id: job.user_id,
              image_url: publicUrl,
              storage_path: uploadData.path,
              prompt: job.prompt_text,
              background_change: job.background_change,
              is_posted: false,
              generation_type: job.generation_type,
              model: dbModel,
              source_image_stock_id: job.source_image_stock_id,
            })
            .select()
            .single();

          if (insertError) {
            console.error("Database insert error:", insertError);
            throw new Error(`画像メタデータの保存に失敗しました: ${insertError.message}`);
          }

          // ===== フェーズ4-4: 成功時の処理 =====
          // image_jobsテーブルを更新（成功時）
          const { data: succeededJob, error: successUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: "succeeded",
              result_image_url: publicUrl,
              error_message: null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .eq("status", "processing")
            .select("id")
            .maybeSingle();

          if (successUpdateError) {
            console.error("Failed to update job status to succeeded:", successUpdateError);
            throw new Error(`ジョブステータスの更新に失敗しました: ${successUpdateError.message}`);
          }

          if (!succeededJob) {
            console.warn(`[Job Success] Skipped succeeded update because status changed: ${jobId}`);
            skippedCount++;
            continue;
          }

          // credit_transactionsのrelated_generation_idを更新
          // 画像生成前にNULLで保存していた取引履歴を、generated_images.idに更新
          try {
            const { error: updateTransactionError } = await supabase
              .from("credit_transactions")
              .update({ related_generation_id: imageRecord.id })
              .eq("user_id", job.user_id)
              .is("related_generation_id", null) // NULLの取引履歴を検索
              .eq("transaction_type", "consumption")
              .eq("metadata->>job_id", jobId); // metadata内のjob_idで特定
            
            if (updateTransactionError) {
              console.error("[Job Success] Failed to update credit transaction:", updateTransactionError);
              // エラーはログに記録するが、処理は継続
            } else {
              console.log(`[Job Success] Updated credit transaction related_generation_id to ${imageRecord.id}`);
            }
          } catch (updateTransactionError) {
            console.error("[Job Success] Failed to update credit transaction:", updateTransactionError);
            // エラーはログに記録するが、処理は継続
          }

          // メッセージを削除（成功時）
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });

          processedCount++;
        } catch (error) {
          // ===== フェーズ4-4: 失敗時の処理 =====
          console.error("[Job Processing] Generation error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          // 現在のジョブのattemptsを取得（更新前に取得する必要がある）
          const { data: currentJob, error: jobFetchError } = await supabase
            .from("image_jobs")
            .select("attempts, started_at")
            .eq("id", jobId)
            .single();

          if (jobFetchError) {
            console.error("Failed to fetch job attempts:", jobFetchError);
            // ジョブの取得に失敗した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
            continue;
          }

          const newAttempts = (currentJob?.attempts || 0) + 1;
          const isNonRetriable = isNonRetriableGenerationError(errorMessage);
          const shouldMarkAsFailed = isNonRetriable || newAttempts >= 3;

          // image_jobsテーブルを更新（失敗時）
          const { data: failUpdatedJob, error: failUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: shouldMarkAsFailed ? "failed" : "queued",
              error_message: errorMessage,
              attempts: newAttempts,
              started_at: shouldMarkAsFailed ? currentJob?.started_at ?? job.started_at : null,
              completed_at: shouldMarkAsFailed ? new Date().toISOString() : null,
            })
            .eq("id", jobId)
            .eq("status", "processing")
            .select("id")
            .maybeSingle();

          if (failUpdateError) {
            console.error("Failed to update job status to failed:", failUpdateError);
            // 更新に失敗した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
            continue;
          }

          if (!failUpdatedJob) {
            skippedCount++;
            continue;
          }

          // 最終失敗が確定した場合のみ返金
          if (shouldMarkAsFailed) {
            try {
              const percoinCost = getPercoinCost(job.model);
              await refundPercoinsFromGeneration(
                supabase,
                job.user_id,
                jobId,
                percoinCost
              );
              console.log(`[Job Processing] Refunded ${percoinCost} percoins for finally failed job ${jobId}`);
            } catch (refundError) {
              // 返金失敗はログに記録（既に減算されているため、手動対応が必要な可能性がある）
              console.error("[Job Processing] Failed to refund percoins after final generation failure:", refundError);
            }
          }

          // メッセージの削除/アーカイブ（即時失敗またはattempts >= 3の場合）
          if (shouldMarkAsFailed) {
            await supabase.rpc("pgmq_delete", {
              p_queue_name: QUEUE_NAME,
              p_msg_id: msgId,
            });
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
        // エラーが発生した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
      }
    }

    return new Response(
      JSON.stringify({
        processed: processedCount,
        skipped: skippedCount,
        total: messages.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge Function error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        stack: errorStack,
        type: error instanceof Error ? error.constructor.name : typeof error,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

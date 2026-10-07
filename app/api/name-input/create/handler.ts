import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { isNameInputAvailable } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { FREE_GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";
import {
  NAME_INPUT_DEFAULT_LABEL,
  NAME_INPUT_LABEL_MAX_LENGTH,
  normalizeNameInputHint,
  type NameInputSlot,
} from "@/shared/generation/name-input";
import {
  NAME_INPUT_CREATE_PERCOIN_COST,
  applyNameInputCreate,
  prepareNameInputCreatePrompt,
} from "@/shared/generation/name-input-create";
import { GACHA_SPLIT_MODEL } from "@/features/generation/lib/gacha-split-openai";
import { callNameInputCreateModel } from "@/features/generation/lib/name-input-create-openai";

/**
 * POST /api/name-input/create — 「本文から名前の欄を作る」(docs/planning/name-input-slot-plan.md REQ-009)。
 *
 * 流れ: ログイン → 使えるか → 本文の長さ → 残高(5ペルコイン以上)
 *      → 文章の AI → 出力を確かめて本文を組み立てる → **作れたときだけ** 引き落とす。
 *
 * 「ガチャに分ける」(app/api/gacha-prompt/split/handler.ts)と同じ順番。返金の経路を持たないため、
 * 「成功の後に引き落とす」順番を崩さないこと。文言は画面側で errorCode から出す。
 */

export type NameInputCreateErrorCode =
  | "NAME_INPUT_CREATE_AUTH_REQUIRED"
  | "NAME_INPUT_CREATE_UNAVAILABLE"
  | "NAME_INPUT_CREATE_INVALID_PROMPT"
  | "NAME_INPUT_CREATE_INSUFFICIENT_BALANCE"
  | "NAME_INPUT_CREATE_NOT_FOUND"
  | "NAME_INPUT_CREATE_FAILED";

export interface NameInputCreateRouteDependencies {
  getUserFn?: typeof getUser;
  isAvailableFn?: (userId: string) => boolean;
  getBalanceFn?: (userId: string) => Promise<number | null>;
  callModelFn?: typeof callNameInputCreateModel;
  deductFn?: (userId: string) => Promise<{ balance: number | null }>;
  revalidateFn?: (userId: string, locale: string) => void;
}

async function defaultGetBalance(userId: string): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return data.balance;
}

class InsufficientBalanceError extends Error {}

async function defaultDeduct(userId: string): Promise<{ balance: number | null }> {
  const { data, error } = await createAdminClient().rpc("deduct_free_percoins", {
    p_user_id: userId,
    p_amount: NAME_INPUT_CREATE_PERCOIN_COST,
    p_metadata: {
      // 履歴の表示(PercoinTransactions)が reason で「名前の欄を作る」と出す
      reason: "name_input_create",
      source: "name_input_create_api",
      model: GACHA_SPLIT_MODEL,
    },
    p_related_generation_id: null,
  });
  if (error) {
    if (/insufficient/i.test(error.message)) throw new InsufficientBalanceError();
    throw new Error(`deduct failed: ${error.code ?? "unknown"}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { balance: typeof row?.balance === "number" ? row.balance : null };
}

function defaultRevalidate(userId: string, locale: string) {
  // ガチャの道具と同じ(残高の表示を直後の router.refresh で新しくする)
  revalidateTag(`free-${userId}-${locale}`, { expire: 0 });
  revalidateTag(`my-page-${userId}`, { expire: 0 });
  revalidateTag(`my-page-credits-${userId}`, { expire: 0 });
}

/** 画面から届いた欄の設定(見出し・入力例・必須)。おかしな値は既定に寄せる。 */
function readSlot(value: unknown): NameInputSlot {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const label =
    typeof record.label === "string"
      ? [...record.label].slice(0, NAME_INPUT_LABEL_MAX_LENGTH).join("")
      : NAME_INPUT_DEFAULT_LABEL;
  const placeholder =
    typeof record.placeholder === "string" && record.placeholder.trim()
      ? normalizeNameInputHint(record.placeholder)
      : undefined;
  return {
    label: label.trim() ? label : NAME_INPUT_DEFAULT_LABEL,
    ...(placeholder ? { placeholder } : {}),
    required: record.required === true,
  };
}

export async function postNameInputCreateRoute(
  request: NextRequest,
  dependencies: NameInputCreateRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const isAvailableFn = dependencies.isAvailableFn ?? isNameInputAvailable;
  const getBalanceFn = dependencies.getBalanceFn ?? defaultGetBalance;
  const callModelFn = dependencies.callModelFn ?? callNameInputCreateModel;
  const deductFn = dependencies.deductFn ?? defaultDeduct;
  const revalidateFn = dependencies.revalidateFn ?? defaultRevalidate;

  // CSRF 防御: cookie 認証でペルコインを使う mutation なので、本文を読む前に Origin を確かめる
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  const user = await getUserFn();
  if (!user) {
    return jsonError("Login required", "NAME_INPUT_CREATE_AUTH_REQUIRED", 401);
  }
  if (!isAvailableFn(user.id)) {
    return jsonError("Not available", "NAME_INPUT_CREATE_UNAVAILABLE", 403);
  }

  const body = (await request.json().catch(() => null)) as
    | { prompt?: unknown; slot?: unknown }
    | null;
  const raw = typeof body?.prompt === "string" ? body.prompt : "";
  // 今ある目印は外してから渡す(AI の行番号はこの本文の行を指す)
  const prompt = prepareNameInputCreatePrompt(raw);
  if (!prompt || raw.length > FREE_GENERATION_PROMPT_MAX_LENGTH) {
    return jsonError("Invalid prompt", "NAME_INPUT_CREATE_INVALID_PROMPT", 400);
  }
  const slot = readSlot(body?.slot);

  const balance = await getBalanceFn(user.id);
  if (balance === null) {
    return jsonError("Failed to read balance", "NAME_INPUT_CREATE_FAILED", 500);
  }
  if (balance < NAME_INPUT_CREATE_PERCOIN_COST) {
    return jsonError("Insufficient balance", "NAME_INPUT_CREATE_INSUFFICIENT_BALANCE", 400);
  }

  let output;
  try {
    output = await callModelFn(prompt);
  } catch (error) {
    console.error("[name-input-create] model failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Failed to create", "NAME_INPUT_CREATE_FAILED", 502);
  }

  const result = applyNameInputCreate(prompt, output, slot);
  if (!result.ok) {
    if (result.reason === "invalid_output") {
      return jsonError("Failed to create", "NAME_INPUT_CREATE_FAILED", 502);
    }
    return jsonError("No name lines", "NAME_INPUT_CREATE_NOT_FOUND", 422);
  }

  // まとめた後の本文が長さの上限を超えるなら、生成で使えないので引き落とさない
  // (短い名前の行を長い目印に差し替えると、上限ぎりぎりの本文は少し伸びる)
  if (result.body.length > FREE_GENERATION_PROMPT_MAX_LENGTH) {
    return jsonError("Too long", "NAME_INPUT_CREATE_INVALID_PROMPT", 400);
  }

  // 作れたときだけ引き落とす
  let newBalance: number | null;
  try {
    ({ balance: newBalance } = await deductFn(user.id));
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return jsonError("Insufficient balance", "NAME_INPUT_CREATE_INSUFFICIENT_BALANCE", 400);
    }
    console.error("[name-input-create] deduct failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Failed to create", "NAME_INPUT_CREATE_FAILED", 500);
  }

  try {
    revalidateFn(user.id, getRouteLocale(request));
  } catch {
    // 残高の表示が数分遅れるだけ
  }

  return NextResponse.json({
    original: prompt,
    body: result.body,
    removedLines: result.removedLines,
    balance: newBalance,
  });
}

export const nameInputCreateRouteHandlers = { postNameInputCreateRoute };

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { isAdminViewer, isGachaPromptAvailable, isGachaSplitAvailable } from "@/lib/env";
import { gachaLimitsFor } from "@/shared/generation/gacha-prompt";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { FREE_GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";
import {
  GACHA_SPLIT_PERCOIN_COST,
  applyGachaSplit,
} from "@/shared/generation/gacha-split";
import {
  GACHA_SPLIT_MODEL,
  callGachaSplitModel,
} from "@/features/generation/lib/gacha-split-openai";

/**
 * POST /api/gacha-prompt/split — 「ガチャに分ける」。
 *
 * 流れ: ログイン → 使えるか(ガチャと道具の両方) → 本文の長さ → 残高(5ペルコイン以上)
 *      → 文章の AI → 出力を確かめて本文と候補欄を組み立てる → **分けられたときだけ** 引き落とす。
 *
 * 分けられなかったとき・AI が失敗したときは引き落とさない。返金の経路を持たないため、
 * 「成功の後に引き落とす」順番を崩さないこと。
 * 文言は画面側で errorCode から出す（ここの error は英語の予備）。
 */

export type GachaSplitErrorCode =
  | "GACHA_SPLIT_AUTH_REQUIRED"
  | "GACHA_SPLIT_UNAVAILABLE"
  | "GACHA_SPLIT_INVALID_PROMPT"
  | "GACHA_SPLIT_INSUFFICIENT_BALANCE"
  | "GACHA_SPLIT_NOT_SPLITTABLE"
  | "GACHA_SPLIT_FAILED";

export interface GachaSplitRouteDependencies {
  getUserFn?: typeof getUser;
  isAvailableFn?: (userId: string) => boolean;
  /** 運営か(運営はガチャの上限を掛けない) */
  isAdminFn?: (userId: string) => boolean;
  getBalanceFn?: (userId: string) => Promise<number | null>;
  callModelFn?: typeof callGachaSplitModel;
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
    p_amount: GACHA_SPLIT_PERCOIN_COST,
    p_metadata: {
      // 履歴の表示(PercoinTransactions)が reason で「ガチャに分ける」と出す
      reason: "gacha_split",
      source: "gacha_split_api",
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
  // /free の残高表示(CachedGenerationPercoinBalance)とマイページの残高・履歴。
  // 直後の router.refresh で新しい残高を出すため、古い値を返さない expire: 0 にする
  revalidateTag(`free-${userId}-${locale}`, { expire: 0 });
  revalidateTag(`my-page-${userId}`, { expire: 0 });
  revalidateTag(`my-page-credits-${userId}`, { expire: 0 });
}

export async function postGachaSplitRoute(
  request: NextRequest,
  dependencies: GachaSplitRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const isAvailableFn =
    dependencies.isAvailableFn ??
    ((userId: string) =>
      isGachaPromptAvailable(userId) && isGachaSplitAvailable(userId));
  const isAdminFn = dependencies.isAdminFn ?? isAdminViewer;
  const getBalanceFn = dependencies.getBalanceFn ?? defaultGetBalance;
  const callModelFn = dependencies.callModelFn ?? callGachaSplitModel;
  const deductFn = dependencies.deductFn ?? defaultDeduct;
  const revalidateFn = dependencies.revalidateFn ?? defaultRevalidate;

  // CSRF 防御: cookie 認証でペルコインを使う mutation なので、本文を読む前に Origin を確かめる
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  const user = await getUserFn();
  if (!user) {
    return jsonError("Login required", "GACHA_SPLIT_AUTH_REQUIRED", 401);
  }
  if (!isAvailableFn(user.id)) {
    return jsonError("Not available", "GACHA_SPLIT_UNAVAILABLE", 403);
  }

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > FREE_GENERATION_PROMPT_MAX_LENGTH) {
    return jsonError("Invalid prompt", "GACHA_SPLIT_INVALID_PROMPT", 400);
  }

  const balance = await getBalanceFn(user.id);
  if (balance === null) {
    return jsonError("Failed to read balance", "GACHA_SPLIT_FAILED", 500);
  }
  if (balance < GACHA_SPLIT_PERCOIN_COST) {
    return jsonError("Insufficient balance", "GACHA_SPLIT_INSUFFICIENT_BALANCE", 400);
  }

  let output;
  try {
    output = await callModelFn(prompt);
  } catch (error) {
    console.error("[gacha-split] model failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Failed to split", "GACHA_SPLIT_FAILED", 502);
  }

  const result = applyGachaSplit(prompt, output, gachaLimitsFor(isAdminFn(user.id)));
  if (!result.ok) {
    // 候補が上限(一般は10個)を超えるときは、減らせば分けられることを画面で伝える
    if (result.reason === "too_many_candidates") {
      return jsonError("Too many candidates", "GACHA_SPLIT_TOO_MANY_CANDIDATES", 422);
    }
    return jsonError("Could not split", "GACHA_SPLIT_NOT_SPLITTABLE", 422);
  }

  // 分けられたときだけ引き落とす
  let newBalance: number | null;
  try {
    ({ balance: newBalance } = await deductFn(user.id));
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return jsonError("Insufficient balance", "GACHA_SPLIT_INSUFFICIENT_BALANCE", 400);
    }
    console.error("[gacha-split] deduct failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("Failed to split", "GACHA_SPLIT_FAILED", 500);
  }

  try {
    revalidateFn(user.id, getRouteLocale(request));
  } catch {
    // 残高の表示が数分遅れるだけ
  }

  return NextResponse.json({
    body: result.body,
    field: result.field,
    removedLines: result.removedLines,
    candidateCount: result.candidateCount,
    balance: newBalance,
  });
}

export const gachaSplitRouteHandlers = { postGachaSplitRoute };

/**
 * prompt_overrides テーブルへの admin client 経由 CRUD。
 * RLS は USING(false) で全拒否なので、必ず service role の admin client を使う。
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PromptOverrideRow,
  ResolvedPromptTemplates,
} from "@/features/generation-prompts/types";
import {
  PROMPT_REGISTRY,
  PROMPT_KEYS,
  type PromptKey,
} from "@/shared/generation/prompt-registry";

/**
 * 全 prompt_overrides 行を取得する (raw)。
 */
export async function listAllPromptOverrides(): Promise<PromptOverrideRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_overrides")
    .select("prompt_key, content, created_by, updated_by, created_at, updated_at")
    .order("prompt_key", { ascending: true });
  if (error) {
    console.error("[prompt-overrides] listAll failed:", error);
    return [];
  }
  return (data ?? []) as PromptOverrideRow[];
}

/**
 * 指定 key の prompt_overrides 行を取得する。無ければ null。
 */
export async function getPromptOverrideByKey(
  key: string,
): Promise<PromptOverrideRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_overrides")
    .select("prompt_key, content, created_by, updated_by, created_at, updated_at")
    .eq("prompt_key", key)
    .maybeSingle();
  if (error) {
    console.error("[prompt-overrides] getByKey failed:", error);
    return null;
  }
  return data as PromptOverrideRow | null;
}

/**
 * 全 prompt_overrides 行を取得し、registry default で欠落キーを埋めた完全な dict を返す。
 * resolver / admin 一覧画面の両方で利用。
 *
 * 障害時 (DB query 失敗) は registry default 100% で返し、生成リクエストは止めない。
 */
export async function getResolvedPromptTemplates(): Promise<ResolvedPromptTemplates> {
  const overrides = await listAllPromptOverrides();
  const overrideMap = new Map(overrides.map((r) => [r.prompt_key, r.content]));
  const resolved: ResolvedPromptTemplates = {};
  for (const key of PROMPT_KEYS) {
    resolved[key] = overrideMap.get(key) ?? PROMPT_REGISTRY[key].defaultContent;
  }
  return resolved;
}

/**
 * admin が prompt を編集 (upsert)。
 * 戻り値は upsert 前の content (差分ログ用、無ければ null)。
 */
export async function upsertPromptOverride(params: {
  key: PromptKey;
  content: string;
  userId: string;
}): Promise<{ previousContent: string | null }> {
  const admin = createAdminClient();
  // 既存 content を取得 (audit log 用)
  const { data: existing } = await admin
    .from("prompt_overrides")
    .select("content")
    .eq("prompt_key", params.key)
    .maybeSingle();
  const previousContent = (existing?.content as string | undefined) ?? null;
  const isNew = previousContent === null;

  const { error } = await admin.from("prompt_overrides").upsert(
    {
      prompt_key: params.key,
      content: params.content,
      updated_by: params.userId,
      // 新規行は created_by も埋める。upsert で既存行更新時は変えない (DB の DEFAULT は使えないため明示)
      ...(isNew ? { created_by: params.userId } : {}),
    },
    { onConflict: "prompt_key" },
  );
  if (error) {
    throw new Error(`[prompt-overrides] upsert failed: ${error.message}`);
  }
  return { previousContent };
}

/**
 * prompt override を削除 (= code default へリセット)。
 * 戻り値は削除前の content (audit log 用、無ければ null)。
 */
export async function deletePromptOverride(
  key: string,
): Promise<{ previousContent: string | null }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("prompt_overrides")
    .select("content")
    .eq("prompt_key", key)
    .maybeSingle();
  const previousContent = (existing?.content as string | undefined) ?? null;
  if (previousContent === null) {
    return { previousContent: null };
  }
  const { error } = await admin
    .from("prompt_overrides")
    .delete()
    .eq("prompt_key", key);
  if (error) {
    throw new Error(`[prompt-overrides] delete failed: ${error.message}`);
  }
  return { previousContent };
}

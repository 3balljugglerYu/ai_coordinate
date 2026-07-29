import { createClient } from "@/lib/supabase/client";
import type { GeneratedImageRecord } from "./database";

/**
 * ブラウザ側のプロンプト読み取り解決（本人の画像限定）。
 *
 * サーバー側の `prompt-secrets.ts` と役割は同じだが、こちらは service role を
 * 使えないため RLS に判断を委ねる。`generated_image_prompt_secrets` の
 * SELECT ポリシーは `auth.uid() = prompt_owner_id` なので、他人の本文は
 * そもそも返らない。マイページのように「本人が自分の生成物を見る」場面だけで
 * 使うこと。
 *
 * 詳細は docs/planning/free-prompt-private-mode-implementation-plan.md ADR-001。
 */

interface ClientPromptResolvableRecord {
  id?: string | null;
  prompt: string;
  generation_type?: GeneratedImageRecord["generation_type"];
}

/**
 * 本文を開示してよい生成種別か。
 *
 * `one_tap_style` は運営が組み立てたプリセット全文、`inspire` はマーカー値。
 * どちらも author secret を作らないため、legacy 列へのフォールバックも禁止する。
 * 許すと「secret が無い」ことを理由に運営資産が露出する。
 */
function isDisclosableGenerationType(
  generationType?: GeneratedImageRecord["generation_type"]
): boolean {
  // prompt-visibility の同種のヘルパーは使わない。あちらは複数のテストで
  // jest.mock されており、モックされた瞬間にこの判定が undefined になる。
  // 秘匿の可否がテストダブルの都合で消えることは許容できないため、
  // ここでは外部モジュールに依存せず自己完結させる。
  return generationType !== "one_tap_style" && generationType !== "inspire";
}

/**
 * 本人の author secret を一括取得して表示用プロンプトを解決する。
 *
 * 取得に失敗した場合は legacy 列へ落とさず投げる。障害時に秘匿境界が
 * 緩む方向へ倒れることを避けるため。
 */
export async function resolveOwnVisiblePrompts<
  T extends ClientPromptResolvableRecord,
>(records: T[]): Promise<T[]> {
  if (records.length === 0) {
    return records;
  }

  const disclosableIds = records
    .filter((record) => isDisclosableGenerationType(record.generation_type))
    .map((record) => record.id)
    .filter((id): id is string => Boolean(id));

  const secrets = new Map<string, string>();

  if (disclosableIds.length > 0) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("generated_image_prompt_secrets")
      .select("image_id, prompt")
      .in("image_id", disclosableIds);

    if (error) {
      throw new Error(`PROMPT_SECRET_LOOKUP_FAILED: ${error.message}`);
    }

    for (const row of data ?? []) {
      const typed = row as { image_id: string; prompt: string };
      secrets.set(typed.image_id, typed.prompt);
    }
  }

  return records.map((record) => {
    if (!isDisclosableGenerationType(record.generation_type)) {
      return record.prompt === "" ? record : { ...record, prompt: "" };
    }

    const secret = record.id ? secrets.get(record.id) : undefined;
    const resolved = secret ?? record.prompt;
    return resolved === record.prompt ? record : { ...record, prompt: resolved };
  });
}

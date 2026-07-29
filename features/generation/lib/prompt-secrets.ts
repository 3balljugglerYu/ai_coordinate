import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedImageRecord } from "./database";

/**
 * プロンプトの読み取り解決。
 *
 * 本文の正本は `generated_image_prompt_secrets`（service-only）で、
 * `generated_images.prompt` は移行期間の互換用に残しているだけである。
 * `generated_images` は行単位 RLS で `anon` にも開放されており列を絞れないため、
 * 公開行に本文を置き続けることはできない。
 *
 * 詳細は docs/planning/free-prompt-private-mode-implementation-plan.md ADR-001。
 *
 * 移行の段階:
 *   Phase 0B (現在) 新規行は secret、既存行は legacy 列。ここでは両方を見る
 *   Phase 0C        legacy 列を空化し、DB 制約で非空値を拒否する
 */

/** 解決に必要な最小の形。Post 型でも生の行でも受けられるようにする。 */
export interface PromptResolvableRecord {
  id?: string | null;
  prompt: string;
  generation_type?: GeneratedImageRecord["generation_type"];
}

/**
 * 本文を開示してよい生成種別か。
 *
 * `one_tap_style` は運営が組み立てたプリセット全文で、生成した本人にも
 * 開示しない。`inspire` は `"inspire"` / `"creator-looks"` のマーカー値しか
 * 入っておらず、開示する意味がない。どちらも author secret を作らないため、
 * legacy 列へのフォールバックも禁止する。フォールバックを許すと、
 * secret が無いことを理由に運営資産が露出してしまう。
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
 * 画像 ID から author secret を一括取得する。
 *
 * 一覧表示のたびに N 件のクエリを投げないよう、ID をまとめて 1 回で引く。
 * service role で読むのは、フォロワーへの開示可否をサーバー側の可視性
 * ルールで判断するため。`authenticated` の直接 SELECT は本人行だけに
 * 限定されており、他人の投稿の本文はそちらからは取れない。
 */
async function fetchPromptSecrets(
  imageIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (imageIds.length === 0) {
    return result;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("generated_image_prompt_secrets")
    .select("image_id, prompt")
    .in("image_id", imageIds);

  if (error) {
    // 取得できないときに legacy 列へ落とすと、障害時に秘匿境界が緩む方向へ
    // 倒れる。呼び出し側が fail closed できるよう、そのまま投げる。
    throw new Error(`PROMPT_SECRET_LOOKUP_FAILED: ${error.message}`);
  }

  for (const row of data ?? []) {
    const typed = row as { image_id: string; prompt: string };
    result.set(typed.image_id, typed.prompt);
  }

  return result;
}

/**
 * 複数レコードの表示用プロンプトを解決する。
 *
 * 開示不可の種別は空文字にし、それ以外は secret を優先して legacy 列へ
 * フォールバックする。フォールバックが必要なのは backfill 前の既存行だけで、
 * Phase 0C 以降は secret に一本化される。
 */
export async function resolveVisiblePrompts<T extends PromptResolvableRecord>(
  records: T[]
): Promise<T[]> {
  if (records.length === 0) {
    return records;
  }

  const disclosableIds = records
    .filter((record) => isDisclosableGenerationType(record.generation_type))
    .map((record) => record.id)
    .filter((id): id is string => Boolean(id));

  const secrets = await fetchPromptSecrets(disclosableIds);

  return records.map((record) => {
    if (!isDisclosableGenerationType(record.generation_type)) {
      return record.prompt === "" ? record : { ...record, prompt: "" };
    }

    const secret = record.id ? secrets.get(record.id) : undefined;
    const resolved = secret ?? record.prompt;
    return resolved === record.prompt ? record : { ...record, prompt: resolved };
  });
}

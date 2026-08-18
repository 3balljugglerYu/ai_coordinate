import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * その生成ジョブで「誰かのプロンプトを使った日次ボーナス」が付与されていたか。
 *
 * **付与の判定はやり直さない。** 付与は生成成功時に record_prompt_usage 経由で
 * 確定しており、ここは確定済みの取引を引くだけ。判定を2箇所に持つと、
 * 片方だけ条件が変わったときに「モーダルは出たが付与されていない」が起きる。
 */
export async function getPromptUseBonusForJob(
  userId: string,
  imageJobId: string | null
): Promise<number> {
  if (!imageJobId) {
    return 0;
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("transaction_type", "prompt_use_bonus")
      .eq("metadata->>image_job_id", imageJobId)
      .maybeSingle();

    if (error || !data) {
      return 0;
    }

    return typeof data.amount === "number" ? data.amount : 0;
  } catch (error) {
    console.error("[Prompt Use Bonus] lookup failed:", error);
    return 0;
  }
}

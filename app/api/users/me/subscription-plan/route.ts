import { connection, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeSubscriptionPlan } from "@/features/subscription/subscription-config";

/**
 * 閲覧者自身の購読プランを返す API。
 *
 * フィードのカードから生成シートを開くときに要る。シートはモデル選択と上限に
 * プランを使うが、投稿詳細と違ってフィードはサーバー側で閲覧者ごとに描き分けて
 * いない(`use cache` を閲覧者で分けたくない)ため、押されたときだけ取りに来る。
 *
 * 返すのは常に**自分自身**のプランで、対象ユーザーは受け取らない。
 * 未ログインは "free"(シートは開かないので実害は無いが、既定へ倒しておく)。
 */
export async function GET() {
  await connection();

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ plan: "free" });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_plan")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[me/subscription-plan] query failed:", error);
      // 取得できないときは無料プランへ倒す(上限の緩い側へ倒さない)
      return NextResponse.json({ plan: "free" });
    }

    return NextResponse.json({
      plan: normalizeSubscriptionPlan(
        (data as { subscription_plan?: string | null } | null)?.subscription_plan
      ),
    });
  } catch (error) {
    console.error("[me/subscription-plan] unexpected error:", error);
    return NextResponse.json({ plan: "free" });
  }
}

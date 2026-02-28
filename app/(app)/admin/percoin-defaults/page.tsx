import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { PercoinDefaultsForm } from "./PercoinDefaultsForm";

const BONUS_SOURCE_LABELS: Record<string, string> = {
  signup_bonus: "新規登録特典",
  tour_bonus: "チュートリアル完了特典",
  referral: "紹介成立特典",
  daily_post: "デイリー投稿特典",
};

/**
 * デフォルト枚数管理ページ
 * 各特典のデフォルト付与枚数を設定する
 * アクセス制御は layout で実施
 */
export default async function AdminPercoinDefaultsPage() {
  const supabase = createAdminClient();

  const [bonusResult, streakResult] = await Promise.all([
    supabase
      .from("percoin_bonus_defaults")
      .select("source, amount")
      .order("source", { ascending: true }),
    supabase
      .from("percoin_streak_defaults")
      .select("streak_day, amount")
      .order("streak_day", { ascending: true }),
  ]);

  const bonusDefaults =
    bonusResult.data?.map((r) => ({
      source: r.source,
      amount: r.amount,
      label: BONUS_SOURCE_LABELS[r.source] ?? r.source,
    })) ?? [];

  const streakDefaults =
    streakResult.data?.map((r) => ({
      streak_day: r.streak_day,
      amount: r.amount,
    })) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          デフォルト枚数設定
        </h1>
        <p className="mt-1 text-slate-600">
          各特典のデフォルト付与枚数を変更できます。変更後は今後発生する付与に反映されます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <PercoinDefaultsForm
            bonusDefaults={bonusDefaults}
            streakDefaults={streakDefaults}
          />
        </CardContent>
      </Card>
    </div>
  );
}

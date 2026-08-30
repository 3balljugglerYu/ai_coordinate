import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { PercoinDefaultsForm } from "./PercoinDefaultsForm";
import { formatDatetimeLocalJst } from "@/lib/datetime/format-datetime-local-jst";
import { foldAppliedSchedule } from "@/features/credits/lib/percoin-schedule";

const BONUS_SOURCE_LABELS: Record<string, string> = {
  signup_bonus: "新規登録特典",
  tour_bonus: "チュートリアル完了特典",
  referral: "紹介成立特典",
  daily_post: "デイリー投稿特典（旧・生成方法を問わない）",
  daily_post_one_tap: "投稿ボーナス：ワンタップスタイル",
  daily_post_free: "投稿ボーナス：フリースタイル",
  daily_post_coordinate: "投稿ボーナス：コーデ（0で停止中）",
  daily_post_inspire: "投稿ボーナス：Creator Looks（機能自体が無効）",
  prompt_use_daily: "誰かのFreeプロンプトを使った時（使った人へ・1日1回）",
  prompt_usage_reward: "Freeプロンプトが利用された時（作者へ）",
  style_usage_reward: "One-Tap Styleが利用された時（クリエイターへ）",
};

/**
 * 画面へ渡す 1 行分。切替済みの予約は現在額へ畳んだうえで、
 * datetime-local 用の JST 文字列を付ける（クライアントで new Date() を読まない）。
 */
function toFormRow(row: {
  amount: number;
  scheduled_amount: number | null;
  scheduled_at: string | null;
}) {
  const folded = foldAppliedSchedule(row);
  return {
    ...folded,
    scheduledAtLocal: formatDatetimeLocalJst(folded.scheduledAt),
  };
}

/**
 * デフォルト枚数管理ページ
 * 各特典のデフォルト付与枚数を設定する
 * アクセス制御は layout で実施
 */
export default async function AdminPercoinDefaultsPage() {
  await connection();

  const supabase = createAdminClient();

  const [bonusResult, streakResult] = await Promise.all([
    supabase
      .from("percoin_bonus_defaults")
      .select("source, amount, scheduled_amount, scheduled_at")
      .order("source", { ascending: true }),
    supabase
      .from("percoin_streak_defaults")
      .select("streak_day, amount, scheduled_amount, scheduled_at")
      .order("streak_day", { ascending: true }),
  ]);

  /*
    取得に失敗したときは**フォームを出さない**。
    黙って空のフォームを出すと「設定が全部消えた」と誤解させ、しかも
    その状態で保存を押せてしまう（実際、列を追加する migration を適用する
    前にこの画面を開いて、空のリストが出た）。
  */
  const loadError = bonusResult.error ?? streakResult.error;

  const bonusDefaults =
    bonusResult.data?.map((r) => ({
      source: r.source,
      label: BONUS_SOURCE_LABELS[r.source] ?? r.source,
      ...toFormRow(r),
    })) ?? [];

  const streakDefaults =
    streakResult.data?.map((r) => ({
      streak_day: r.streak_day,
      ...toFormRow(r),
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
          日時を指定した「予約」もでき、その時刻になると自動で切り替わります。
        </p>
      </header>

      {loadError ? (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-6 text-sm text-red-900">
            <p className="font-semibold">設定を読み込めませんでした</p>
            <p className="mt-1">
              現在の設定は消えていません。読み取りに失敗しているだけです。
              マイグレーションが未適用の場合は適用してから開き直してください。
            </p>
            <p className="mt-2 font-mono text-xs text-red-700">
              {loadError.message}
            </p>
          </CardContent>
        </Card>
      ) : (
      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <PercoinDefaultsForm
            bonusDefaults={bonusDefaults}
            streakDefaults={streakDefaults}
          />
        </CardContent>
      </Card>
      )}
    </div>
  );
}

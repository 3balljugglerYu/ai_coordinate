import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { PercoinDefaultsForm } from "./PercoinDefaultsForm";
import { formatDatetimeLocalJst } from "@/lib/datetime/format-datetime-local-jst";
import { resolveScheduleState } from "@/features/credits/lib/percoin-schedule";

/**
 * 切替日時を過ぎた予約は「もう起きたこと」として現在額に畳んで画面へ渡す。
 *
 * ⚠️ 畳まないと2つの事故が起きる。
 *  1. 過去日時の予約が入力欄に残り、**別の項目を直しただけでも保存が
 *     「切替日時は未来を指定してください」で弾かれる**（保存が詰まる）
 *  2. その予約を画面から消して保存すると、実際に配られている額(予約額)が
 *     切替前の古い額へ**黙って戻る**
 *
 * 判定はサーバーで済ませる。クライアントの render 中に現在時刻を読むと、
 * 切替時刻をまたいだときに SSR と hydration で表示が食い違う。
 */
function foldAppliedSchedule(row: {
  amount: number;
  scheduled_amount: number | null;
  scheduled_at: string | null;
}) {
  const state = resolveScheduleState({
    scheduledAmount: row.scheduled_amount,
    scheduledAt: row.scheduled_at,
  });

  if (state.kind === "applied") {
    return {
      amount: state.amount,
      scheduledAmount: null,
      scheduledAtLocal: "",
      scheduledAt: null,
      // 「いつ切り替わって、いまいくつなのか」を画面に出すために残す
      appliedFrom: row.scheduled_at,
      previousAmount: row.amount,
    };
  }

  return {
    amount: row.amount,
    scheduledAmount: row.scheduled_amount ?? null,
    // datetime-local は JST 前提。サーバーで変換して渡し、
    // クライアントで new Date() を読まない(Hydration Mismatch を避ける)
    scheduledAtLocal: formatDatetimeLocalJst(row.scheduled_at),
    scheduledAt: row.scheduled_at ?? null,
    appliedFrom: null as string | null,
    previousAmount: null as number | null,
  };
}

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

  const bonusDefaults =
    bonusResult.data?.map((r) => ({
      source: r.source,
      label: BONUS_SOURCE_LABELS[r.source] ?? r.source,
      ...foldAppliedSchedule(r),
    })) ?? [];

  const streakDefaults =
    streakResult.data?.map((r) => ({
      streak_day: r.streak_day,
      ...foldAppliedSchedule(r),
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

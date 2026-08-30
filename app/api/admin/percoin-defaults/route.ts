import { connection, NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  BONUS_SOURCES,
  validateBonusAmount,
} from "@/features/credits/lib/percoin-bonus-defaults";
import { validateScheduledAt } from "@/features/credits/lib/percoin-schedule";

/**
 * 予約(額 + 日時)の検証。両方揃っているか・未来か・額が範囲内かを見る。
 *
 * 保存側で弾かないと、切替日時が過去の予約は「保存した瞬間に効いてしまう」。
 * 画面では未来しか選べないが、API を直接叩ける以上ここでも守る。
 */
function addScheduleIssues(
  ctx: z.RefinementCtx,
  input: {
    scheduledAmount: number | null;
    scheduledAt: string | null;
    validateAmount: (amount: number) => string | null;
  }
): void {
  const { scheduledAmount, scheduledAt, validateAmount } = input;

  if (scheduledAmount === null && scheduledAt === null) return;

  if (scheduledAmount === null || scheduledAt === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: "予約は切替日時と額の両方を指定してください",
    });
    return;
  }

  const amountError = validateAmount(scheduledAmount);
  if (amountError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_amount"],
      message: amountError,
    });
  }

  const atError = validateScheduledAt(scheduledAt);
  if (atError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: atError,
    });
  }
}

const patchBodySchema = z.object({
  bonusDefaults: z.array(
    z
      .object({
        source: z.enum(BONUS_SOURCES),
        // 範囲は source ごとに違うため、ここでは広めに受けて共有ルールで判定する
        amount: z.number().int(),
        /*
          予約。額と日時は必ず両方揃うか、両方 null。片方だけだと
          「いつ切り替わるか分からない予約」になる（DB の CHECK と同じ規則）。
        */
        scheduled_amount: z.number().int().nullable().optional(),
        scheduled_at: z.string().nullable().optional(),
      })
      .superRefine((value, ctx) => {
        const error = validateBonusAmount(value.source, value.amount);
        if (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["amount"],
            message: error,
          });
        }
        addScheduleIssues(ctx, {
          scheduledAmount: value.scheduled_amount ?? null,
          scheduledAt: value.scheduled_at ?? null,
          // 予約額にも現在額と同じ範囲を課す。緩めると切り替わった瞬間に
          // 許容外の額で配り始める
          validateAmount: (amount) => validateBonusAmount(value.source, amount),
        });
      })
  ),
  streakDefaults: z.array(
    z
      .object({
        streak_day: z.number().int().min(1).max(14),
        amount: z.number().int().min(1).max(1000),
        scheduled_amount: z.number().int().nullable().optional(),
        scheduled_at: z.string().nullable().optional(),
      })
      .superRefine((value, ctx) => {
        addScheduleIssues(ctx, {
          scheduledAmount: value.scheduled_amount ?? null,
          scheduledAt: value.scheduled_at ?? null,
          validateAmount: (amount) =>
            amount >= 1 && amount <= 1000
              ? null
              : "連続ログイン特典は 1〜1000 の整数で指定してください",
        });
      })
  ),
});

/**
 * デフォルト枚数を取得（管理者用）
 */
export async function GET() {
  await connection();
  try {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

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

    if (bonusResult.error) {
      console.error("[Percoin Defaults] bonus fetch error:", bonusResult.error);
      return NextResponse.json(
        { error: "デフォルト枚数の取得に失敗しました" },
        { status: 500 }
      );
    }

    if (streakResult.error) {
      console.error("[Percoin Defaults] streak fetch error:", streakResult.error);
      return NextResponse.json(
        { error: "ストリークデフォルトの取得に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bonusDefaults: bonusResult.data ?? [],
      streakDefaults: streakResult.data ?? [],
    });
  } catch (error) {
    console.error("[Percoin Defaults] GET Exception:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

/**
 * デフォルト枚数を更新（管理者用）
 */
export async function PATCH(request: NextRequest) {
  try {
    let admin;
    try {
      admin = await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const body = await request.json();
    const parsed = patchBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力が不正です", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { bonusDefaults, streakDefaults } = parsed.data;

    // streak は 1〜14 日分が揃っている必要がある
    const streakDays = new Set(streakDefaults.map((s) => s.streak_day));
    for (let d = 1; d <= 14; d++) {
      if (!streakDays.has(d)) {
        return NextResponse.json(
          { error: `streak_day 1〜14 の全てが必要です（${d}日目が不足）` },
          { status: 400 }
        );
      }
    }

    const supabase = createAdminClient();

    /*
      予約は「送られてこなければ解除」ではなく「null が来たら解除」。
      画面は常に全項目を送るため、明示しないと予約を消せない。
    */
    const bonusUpsert = bonusDefaults.map((b) => ({
      source: b.source,
      amount: b.amount,
      scheduled_amount: b.scheduled_amount ?? null,
      scheduled_at: b.scheduled_at ?? null,
      updated_at: new Date().toISOString(),
    }));

    const streakUpsert = streakDefaults.map((s) => ({
      streak_day: s.streak_day,
      amount: s.amount,
      scheduled_amount: s.scheduled_amount ?? null,
      scheduled_at: s.scheduled_at ?? null,
      updated_at: new Date().toISOString(),
    }));

    const [bonusResult, streakResult] = await Promise.all([
      supabase.from("percoin_bonus_defaults").upsert(bonusUpsert, {
        onConflict: "source",
      }),
      supabase.from("percoin_streak_defaults").upsert(streakUpsert, {
        onConflict: "streak_day",
      }),
    ]);

    if (bonusResult.error) {
      console.error("[Percoin Defaults] bonus upsert error:", bonusResult.error);
      return NextResponse.json(
        { error: "デフォルト枚数の更新に失敗しました" },
        { status: 500 }
      );
    }

    if (streakResult.error) {
      console.error("[Percoin Defaults] streak upsert error:", streakResult.error);
      return NextResponse.json(
        { error: "ストリークデフォルトの更新に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag("percoin-defaults", "max");

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "bonus_defaults_update",
      targetType: "percoin_defaults",
      metadata: {
        bonusDefaults: bonusUpsert,
        streakDefaults: streakUpsert,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Percoin Defaults] PATCH Exception:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "更新に失敗しました",
      },
      { status: 500 }
    );
  }
}

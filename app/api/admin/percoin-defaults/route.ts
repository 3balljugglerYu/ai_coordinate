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
import {
  foldAppliedSchedule,
  validateScheduledAt,
} from "@/features/credits/lib/percoin-schedule";

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

    /*
      切替済みの予約は現在額へ畳んで返す（admin 画面と同じ扱い）。
      raw のまま返すと「GET した内容をそのまま PATCH する」だけで過去日時が
      送られ、「切替日時は未来を指定してください」で保存が詰まる。
      切替があった事実は applied_from / previous_amount で分かるようにする。
    */
    const foldRow = <T extends Record<string, unknown>>(
      row: T & {
        amount: number;
        scheduled_amount: number | null;
        scheduled_at: string | null;
      }
    ) => {
      const folded = foldAppliedSchedule(row);
      return {
        ...row,
        amount: folded.amount,
        scheduled_amount: folded.scheduledAmount,
        scheduled_at: folded.scheduledAt,
        applied_from: folded.appliedFrom,
        previous_amount: folded.previousAmount,
      };
    };

    return NextResponse.json({
      bonusDefaults: (bonusResult.data ?? []).map(foldRow),
      streakDefaults: (streakResult.data ?? []).map(foldRow),
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
      予約は **null が来たら解除・項目ごと省略されたら現状維持**。
      省略を解除にすると、`source` と `amount` だけを送る従来のスクリプトや
      手元の curl が、設定済みの将来予約を黙って消してしまう。
      画面は常に null を明示して送るので、これで解除もできる。
    */
    const touchesSchedule = (row: {
      scheduled_amount?: number | null;
      scheduled_at?: string | null;
    }) => row.scheduled_amount !== undefined || row.scheduled_at !== undefined;

    const updatedAt = new Date().toISOString();

    const bonusUpsert = bonusDefaults.map((b) => ({
      source: b.source,
      amount: b.amount,
      updated_at: updatedAt,
      ...(touchesSchedule(b)
        ? {
            scheduled_amount: b.scheduled_amount ?? null,
            scheduled_at: b.scheduled_at ?? null,
          }
        : {}),
    }));

    const streakUpsert = streakDefaults.map((s) => ({
      streak_day: s.streak_day,
      amount: s.amount,
      updated_at: updatedAt,
      ...(touchesSchedule(s)
        ? {
            scheduled_amount: s.scheduled_amount ?? null,
            scheduled_at: s.scheduled_at ?? null,
          }
        : {}),
    }));

    /*
      ⚠️ **予約列に触る行と触らない行を同じ upsert に混ぜない。**
      supabase-js は配列の**キーの和集合**を `columns=` に入れて送るため、
      混ぜると、省略したはずの行の scheduled_* まで対象列になり NULL で
      埋められる（＝設定済みの将来予約が消える）。行ごとの省略は、
      配列を分けて初めて意味を持つ。
    */
    const upsertSplit = async (
      table: "percoin_bonus_defaults" | "percoin_streak_defaults",
      rows: Array<Record<string, unknown>>,
      onConflict: string
    ) => {
      const groups = [
        rows.filter((row) => "scheduled_at" in row),
        rows.filter((row) => !("scheduled_at" in row)),
      ].filter((group) => group.length > 0);

      for (const group of groups) {
        const { error } = await supabase
          .from(table)
          .upsert(group, { onConflict });
        if (error) return { error };
      }
      return { error: null };
    };

    const [bonusResult, streakResult] = await Promise.all([
      upsertSplit("percoin_bonus_defaults", bonusUpsert, "source"),
      upsertSplit("percoin_streak_defaults", streakUpsert, "streak_day"),
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

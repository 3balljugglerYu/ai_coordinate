import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

const BONUS_SOURCES = [
  "signup_bonus",
  "tour_bonus",
  "referral",
  "daily_post",
] as const;

const patchBodySchema = z.object({
  bonusDefaults: z.array(
    z.object({
      source: z.enum(BONUS_SOURCES),
      amount: z.number().int().min(1).max(1000),
    })
  ),
  streakDefaults: z.array(
    z.object({
      streak_day: z.number().int().min(1).max(14),
      amount: z.number().int().min(1).max(1000),
    })
  ),
});

/**
 * デフォルト枚数を取得（管理者用）
 */
export async function GET() {
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
        .select("source, amount")
        .order("source", { ascending: true }),
      supabase
        .from("percoin_streak_defaults")
        .select("streak_day, amount")
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

    const bonusUpsert = bonusDefaults.map((b) => ({
      source: b.source,
      amount: b.amount,
      updated_at: new Date().toISOString(),
    }));

    const streakUpsert = streakDefaults.map((s) => ({
      streak_day: s.streak_day,
      amount: s.amount,
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

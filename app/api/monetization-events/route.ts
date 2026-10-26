import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { parseClientMonetizationEvent } from "@/features/monetization/lib/monetization-event-types";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";
import { createAdminClient } from "@/lib/supabase/admin";

/** 本当の残高(画面から送られた残高は信じない)。読めなければ null。 */
async function readBalance(userId: string): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.balance === "number" ? data.balance : null;
  } catch {
    return null;
  }
}

/**
 * POST: 画面から、課金の手前の出来事(足りなくなった・購入画面を見た)を送る。
 * 人はログイン中のセッションで決め、本文の user_id は受け取らない。
 * 「足りなくなった」の残高は、画面から送られた値を使わず、サーバーで読み直す。
 * 本当は足りているのに送られてきたものは書かない。
 * 回数の上限は DB(record_monetization_event)が数える。
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const input = parseClientMonetizationEvent(body);
  if (!input) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  let balance: number | null = null;
  if (input.eventType === "percoin_shortage") {
    balance = await readBalance(user.id);
    if (balance === null) {
      return NextResponse.json({ recorded: false });
    }
    if (input.required !== null && balance >= input.required) {
      // 本当は足りている(画面の残高が古い・作られた値など)
      return NextResponse.json({ recorded: false });
    }
  }

  const recorded = await recordMonetizationEvent({
    userId: user.id,
    eventType: input.eventType,
    feature: input.feature,
    whereDetected: "client",
    origin: input.origin,
    required: input.required,
    balance,
  });

  return NextResponse.json({ recorded });
}

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { parseClientMonetizationEvent } from "@/features/monetization/lib/monetization-event-types";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";

/**
 * POST: 画面から、課金の手前の出来事(足りなくなった・購入画面を見た)を送る。
 * 人はログイン中のセッションで決め、本文の user_id は受け取らない。
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

  const recorded = await recordMonetizationEvent({
    userId: user.id,
    eventType: input.eventType,
    feature: input.feature,
    whereDetected: "client",
    origin: input.origin,
    required: input.required,
    balance: input.balance,
  });

  return NextResponse.json({ recorded });
}

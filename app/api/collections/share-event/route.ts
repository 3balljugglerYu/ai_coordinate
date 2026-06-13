import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/collections/share-event { completionId }
 * 台紙の所有者が公開ページURLをシェアした際に mount_shared を記録する。
 * 所有者のみ(RLS で本人の completion しか見えない)を確認してから記録する。
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let completionId: unknown;
  try {
    const body = await request.json();
    completionId = body?.completionId;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  if (typeof completionId !== "string" || !UUID_PATTERN.test(completionId)) {
    return NextResponse.json({ error: "INVALID_COMPLETION_ID" }, { status: 400 });
  }

  // 所有者確認(本人の completed 行のみ。RLS で他人の行は見えない)
  const { data, error } = await supabase
    .from("collection_completions")
    .select("id, category_key")
    .eq("id", completionId)
    .eq("mount_status", "completed")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    await recordStyleUsageEvent({
      userId: user.id,
      authState: "authenticated",
      eventType: "mount_shared",
      // series 別集計のため category_key を style_id に格納する(KPI が series で絞る)。
      // null-data は上の !data ガードで 404 済み。空文字も念のため null 化する。
      styleId: (data.category_key as string | null) || null,
    });
  } catch (e) {
    console.error("[collections share-event] record failed:", e);
    // 計測失敗は致命ではない
  }

  return NextResponse.json({ ok: true });
}

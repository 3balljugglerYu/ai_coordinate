import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import {
  recordStyleUsageEvent,
  type StyleUsageEventType,
} from "@/features/style/lib/style-usage-events";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/collections/share-event { completionId, lotteryEntry? }
 * 台紙の所有者が公開ページURLをシェアした際に mount_shared を記録する。
 * 所有者のみ(RLS で本人の completion しか見えない)を確認してから記録する。
 *
 * `lotteryEntry: true` は「Xで応募する」からの呼び出し。**mount_shared に加えて**
 * lottery_entry_click を記録する(mount_shared を置き換えない)。応募もシェアURLの
 * 発行なので、発行数の定義を変えると過去の企画と比較できなくなる。
 * 集計側は「通常シェアのみ = mount_shared - lottery_entry_click」で読む。
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
  let lotteryEntry = false;
  try {
    const body = await request.json();
    completionId = body?.completionId;
    // 真偽値以外は false 扱い(未指定の古いクライアントは通常シェアのまま)
    lotteryEntry = body?.lotteryEntry === true;
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

  // style_id への格納は**後方互換のため残す**(既存行がこの形で入っており、
  // KPI は過去分もこの列で数えている)。新しい正本は category_key 列。
  // null-data は上の !data ガードで 404 済み。空文字も念のため null 化する。
  const categoryKey = (data.category_key as string | null) || null;
  const eventTypes: StyleUsageEventType[] = lotteryEntry
    ? ["mount_shared", "lottery_entry_click"]
    : ["mount_shared"];

  for (const eventType of eventTypes) {
    try {
      await recordStyleUsageEvent({
        userId: user.id,
        authState: "authenticated",
        eventType,
        styleId: categoryKey,
        categoryKey,
        viewerKey: `u:${user.id}`,
      });
    } catch (e) {
      // 計測失敗は致命ではない。片方が失敗しても、もう片方は記録を試みる
      // (mount_shared だけ落ちると応募数がシェア数を上回って見えるため)。
      console.error(`[collections share-event] record ${eventType} failed:`, e);
    }
  }

  return NextResponse.json({ ok: true });
}

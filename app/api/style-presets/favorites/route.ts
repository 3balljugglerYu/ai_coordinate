import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * /style プリセットの「お気に入り(♡)」追加・解除 API。
 *
 * - user_id は必ずサーバセッション(getUser)から解決する(クライアント body 不可)。
 * - RLS(style_preset_favorites: 本人行のみ)+ セッションクライアントで多重防御。
 * - GET は提供しない: 初期のお気に入り集合は StylePageBody がサーバで供給し、
 *   以後はクライアントの楽観更新で保つ(往復削減)。
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveRequest(request: NextRequest): Promise<
  | { ok: true; userId: string; presetId: string }
  | { ok: false; response: NextResponse }
> {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) {
    return { ok: false, response: originGuard };
  }
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  let presetId: unknown;
  try {
    presetId = ((await request.json()) as { presetId?: unknown })?.presetId;
  } catch {
    presetId = undefined;
  }
  if (typeof presetId !== "string" || !UUID_PATTERN.test(presetId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid presetId" }, { status: 400 }),
    };
  }
  return { ok: true, userId: user.id, presetId };
}

/** お気に入り追加(冪等: 既登録は成功扱い)。 */
export async function POST(request: NextRequest) {
  await connection();
  const resolved = await resolveRequest(request);
  if (!resolved.ok) return resolved.response;

  const supabase = await createClient();
  const { error } = await supabase.from("style_preset_favorites").upsert(
    { user_id: resolved.userId, preset_id: resolved.presetId },
    { onConflict: "user_id,preset_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[style-preset-favorites POST] failed:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** お気に入り解除(冪等: 未登録でも成功扱い)。 */
export async function DELETE(request: NextRequest) {
  await connection();
  const resolved = await resolveRequest(request);
  if (!resolved.ok) return resolved.response;

  const supabase = await createClient();
  const { error } = await supabase
    .from("style_preset_favorites")
    .delete()
    .eq("user_id", resolved.userId)
    .eq("preset_id", resolved.presetId);
  if (error) {
    console.error("[style-preset-favorites DELETE] failed:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

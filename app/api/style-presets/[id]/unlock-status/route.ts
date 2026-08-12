import { connection, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/env";
import { resolvePresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

/**
 * スタイルが「この閲覧者にとって開放済みか」を返す API。
 *
 * ## なぜ必要か
 *
 * `/styles/[slug]` は SEO 用の公開ページで、全員が同じキャッシュを共有するため
 * 閲覧者の解放状態を知らない。そのため未開放のスタイルでも「このスタイルで作る」が
 * 押せてしまい、`/style` へ飛んだ先で黙って別のスタイルに差し替わっていた。
 * 押す前に伝えるには、ページ側から1回だけ問い合わせる必要がある。
 *
 * 呼ぶのは**段階解放のカテゴリのときだけ**。ゲートの無いカテゴリはページ自身が
 * 判別できるので、大多数のアクセスではこの API を呼ばない。
 *
 * ## 返すもの
 *
 * 未公開・admin_only・存在しない ID は `unknown` を返し、`locked` とは区別する。
 * 「まだ開放されていません」と答えると、そこに何かあることが分かってしまうため。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id } = await params;
    const user = await getUser();
    const supabase = await createClient();

    const state = await resolvePresetUnlockState(id, user?.id ?? null, supabase, {
      includeAdminOnly: isAdminViewer(user?.id ?? null),
    });

    return NextResponse.json(state);
  } catch (error) {
    console.error("[style-presets unlock-status] unexpected error:", error);
    // 判定できないときは案内を出さない側へ倒す(誤って「開放されていません」と
    // 言うより、従来どおり進ませて生成側の判定に委ねる方が害が小さい)
    return NextResponse.json({ status: "unknown" });
  }
}

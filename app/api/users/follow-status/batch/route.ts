import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * フォロー状態のバッチ取得API。
 *
 * フィード表示はカードごとに作者へのフォロー状態が要る。既存の
 * `/api/users/[userId]/follow-status` を各カードから呼ぶと、20件のフィードで
 * 20リクエストになり、スクロールのたびに増える。ここでまとめて解決する。
 *
 * 返すのは「閲覧者がその相手をフォローしているか」だけで、他人同士の関係は
 * 返さない(follower_id は常にサーバー側のセッションから取る = 偽装不可)。
 * 未ログインは 200 + 空マップ。フィードは未ログインでも見られるため、
 * ここで 401 にするとカードの描画が止まってしまう。
 */

const bodySchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const result = bodySchema.safeParse(await request.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json(
        { error: "invalid body", errorCode: "FOLLOW_STATUS_INVALID_BODY" },
        { status: 400 }
      );
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ following: {} });
    }

    // 自分自身は「フォロー」の対象外なので問い合わせから外す。
    const targetIds = Array.from(new Set(result.data.user_ids)).filter(
      (id) => id !== user.id
    );
    if (targetIds.length === 0) {
      return NextResponse.json({ following: {} });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .in("followee_id", targetIds);

    if (error) {
      console.error("[follow-status batch] query failed:", error);
      return NextResponse.json(
        { error: "failed", errorCode: "FOLLOW_STATUS_FETCH_FAILED" },
        { status: 500 }
      );
    }

    // 問い合わせた相手を全員含めた map にする(false も明示的に返す)。
    // 未定義とfalseが混ざると、呼び出し側が「未取得」と「未フォロー」を区別できない。
    const following: Record<string, boolean> = {};
    for (const id of targetIds) {
      following[id] = false;
    }
    for (const row of data ?? []) {
      following[row.followee_id] = true;
    }

    return NextResponse.json({ following });
  } catch (error) {
    console.error("[follow-status batch] unexpected error:", error);
    return NextResponse.json(
      { error: "failed", errorCode: "FOLLOW_STATUS_FETCH_FAILED" },
      { status: 500 }
    );
  }
}

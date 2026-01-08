import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { createClient } from "@/lib/supabase/server";

/**
 * デイリー投稿特典を付与するヘルパー関数
 * べき等性を保証し、同じ投稿IDで複数回呼び出しても1回のみ特典が付与されます
 * @param userId ユーザーID
 * @param generationId 投稿された画像のID
 * @returns 付与されたペルコイン数（0: 未付与、50: 付与成功）
 */
async function grantDailyPostBonus(
  userId: string,
  generationId: string
): Promise<number> {
  try {
    console.log("[Daily Post Bonus] Attempting to grant bonus for user:", userId, "generation:", generationId);
    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "grant_daily_post_bonus",
      {
        p_user_id: userId,
        p_generation_id: generationId,
      }
    );

    console.log("[Daily Post Bonus] RPC response:", { data, error: rpcError });

    if (!rpcError && typeof data === "number") {
      const bonusAmount = data;
      console.log("[Daily Post Bonus] Bonus granted:", bonusAmount);
      return bonusAmount;
    } else if (rpcError) {
      console.error("[Daily Post Bonus] RPC error:", rpcError);
      // エラー時は0を返す（投稿は成功させる）
      return 0;
    }

    return 0;
  } catch (error) {
    console.error("[Daily Post Bonus] Exception:", error);
    // エラー時は0を返す（投稿は成功させる）
    return 0;
  }
}

/**
 * 投稿API
 */
export async function POST(request: NextRequest) {
  console.log("[Post API] POST /api/posts/post called");
  try {
    const user = await requireAuth();
    console.log("[Post API] User authenticated:", user.id);

    const body = await request.json();
    const { id, caption } = body;
    console.log("[Post API] Request body:", { id, caption });

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // 投稿処理
    console.log("[Post API] Calling postImageServer...");
    const result = await postImageServer(id, caption);
    console.log("[Post API] Post result:", { id: result.id, is_posted: result.is_posted });

    // デイリー投稿特典の付与（エラーが発生しても投稿は成功させる）
    // 注意: デイリーボーナスは新しい投稿（POST /api/posts/post）でのみ付与されます
    // キャプション更新（PUT /api/posts/update）ではボーナスを付与しません
    const bonus_granted = await grantDailyPostBonus(user.id, result.id!);

    return NextResponse.json({
      id: result.id!,
      is_posted: result.is_posted,
      caption: result.caption ?? null,
      posted_at: result.posted_at || new Date().toISOString(),
      bonus_granted, // 付与されたペルコイン数（0: 未付与、50: 付与成功）
    });
  } catch (error) {
    console.error("Post API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "投稿に失敗しました",
      },
      { status: 500 }
    );
  }
}


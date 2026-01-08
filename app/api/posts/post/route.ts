import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { createClient } from "@/lib/supabase/server";

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
    let bonus_granted = 0;
    try {
      console.log("[Daily Post Bonus] Attempting to grant bonus for user:", user.id, "generation:", result.id!);
      const supabase = await createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "grant_daily_post_bonus",
        {
          p_user_id: user.id,
          p_generation_id: result.id!,
        }
      );

      console.log("[Daily Post Bonus] RPC response:", { data, error: rpcError });

      if (!rpcError && typeof data === "number") {
        bonus_granted = data;
        console.log("[Daily Post Bonus] Bonus granted:", bonus_granted);
      } else if (rpcError) {
        console.error("[Daily Post Bonus] RPC error:", rpcError);
        // エラー時はbonus_granted=0のまま（投稿は成功させる）
      }
    } catch (error) {
      console.error("[Daily Post Bonus] Exception:", error);
      // エラー時はbonus_granted=0のまま（投稿は成功させる）
    }

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


import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }
    if (userId === user.id) {
      return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });
    }

    const { error } = await supabase.from("user_blocks").insert({
      blocker_id: user.id,
      blocked_id: userId,
    });

    if (error) {
      if (error.code === "23505") {
        revalidateTag("home-posts", "max");
        revalidateTag("home-posts-week", "max");
        revalidateTag("search-posts", "max");
        return NextResponse.json({ success: true, isBlocked: true });
      }
      console.error("Block insert error:", error);
      return NextResponse.json({ error: "Failed to block user" }, { status: 500 });
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    return NextResponse.json({ success: true, isBlocked: true });
  } catch (error) {
    console.error("Block API error:", error);
    return NextResponse.json({ error: "ブロックに失敗しました" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", userId);

    if (error) {
      console.error("Block delete error:", error);
      return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    return NextResponse.json({ success: true, isBlocked: false });
  } catch (error) {
    console.error("Unblock API error:", error);
    return NextResponse.json({ error: "ブロック解除に失敗しました" }, { status: 500 });
  }
}

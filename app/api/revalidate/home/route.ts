import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";

/**
 * ホーム画面のキャッシュを無効化するAPI
 * 投稿完了時にクライアントから呼び出し、投稿一覧を更新する
 */
export async function POST() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revalidate home error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

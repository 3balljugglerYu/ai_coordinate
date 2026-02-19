import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";

/**
 * コーディネート画面のキャッシュを無効化するAPI
 * 画像生成完了時にクライアントから呼び出し、生成結果一覧を更新する
 */
export async function POST() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // revalidateTag: use cache のキャッシュを無効化
    revalidateTag(`coordinate-${user.id}`, "max");
    // revalidatePath: ページ全体のキャッシュを即時無効化（router.refresh で最新データを取得するため）
    revalidatePath("/coordinate");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revalidate coordinate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

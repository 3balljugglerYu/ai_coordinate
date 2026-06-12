import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/env";
import { getCollectionProgressForUser } from "@/features/collections/lib/collection-progress-repository";

/**
 * GET /api/collections/progress
 * ログインユーザーのアクティブなコレクション進捗を返す。
 * 未ログインは空配列(進捗はログイン前提)。
 * admin は admin_only シリーズもプレビュー対象に含める(公開前確認用)。
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ items: [] });
  }

  const isAdmin = isAdminViewer(user.id);

  try {
    const items = await getCollectionProgressForUser(user.id, isAdmin);
    // isAdminViewer は admin 限定の進捗モーダル再表示(?collection_reset)の許可判定に使う。
    return NextResponse.json({ items, isAdminViewer: isAdmin });
  } catch (error) {
    console.error("[collections progress GET] failed:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}

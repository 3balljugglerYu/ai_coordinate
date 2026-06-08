import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUserIds } from "@/lib/env";
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

  const isAdmin = getAdminUserIds().includes(user.id);

  try {
    const items = await getCollectionProgressForUser(user.id, isAdmin);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[collections progress GET] failed:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}

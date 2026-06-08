import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCollectionProgress } from "@/features/collections/lib/collection-progress-repository";

/**
 * GET /api/collections/progress
 * ログインユーザーのアクティブなコレクション進捗を返す。
 * 未ログインは空配列(進捗はログイン前提)。
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await getCollectionProgress(supabase);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[collections progress GET] failed:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}

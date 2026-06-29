import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/env";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { resolveCollectionUnlockContext } from "@/features/collections/lib/collection-unlock-server";
import { buildCollectionUnlockAnnouncements } from "@/features/collections/lib/collection-unlock-announcement";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";

/**
 * GET /api/collections/unlock-announcements
 *
 * ログインユーザーの「解放お知らせ」サマリ(解放数・総数・解放順サムネ・前提カテゴリ)を返す。
 * 生成直後(進捗モーダルを閉じた直後)に最新の解放状況を取得して段階解放モーダルを出す
 * `CollectionUnlockDripListener` から呼ばれる。
 *
 * - 未ログインは空配列(解放はログイン前提)。
 * - admin は admin_only カテゴリも対象(公開前プレビュー用)。
 * - 解放ゲート付きカテゴリが無ければ即空配列(RPC を叩かない)。
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ announcements: [] });
  }

  const isAdmin = isAdminViewer(user.id);

  try {
    const presets = await getPublishedStylePresets({ includeAdminOnly: isAdmin });
    // 前提カテゴリ付き or sequential が対象。sequential を見落とすと、公開中の前提
    // カテゴリが無いとき(例: ぷち神が非公開)に travel(sequential)の告知が作られない。
    const hasGatedCategory = presets.some((preset) =>
      categoryNeedsUnlockContext(preset.category),
    );
    if (!hasGatedCategory) {
      return NextResponse.json({ announcements: [] });
    }

    const context = await resolveCollectionUnlockContext(
      presets,
      user.id,
      supabase,
    );
    const announcements = buildCollectionUnlockAnnouncements(presets, context);
    return NextResponse.json({ announcements });
  } catch (error) {
    console.error("[collections unlock-announcements GET] failed:", error);
    return NextResponse.json({ announcements: [] }, { status: 500 });
  }
}

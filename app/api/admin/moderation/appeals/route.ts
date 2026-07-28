import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingAppealsForAdmin } from "@/features/moderation/lib/appeal-repository";
import { shouldHideThumbnailForPolicy } from "@/constants/moderation-policy";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

/**
 * GET /api/admin/moderation/appeals
 *
 * 審査待ちの異議申立てキュー。既存の
 * `app/api/admin/moderation/posts/route.ts` と同じ形（requireAdmin + admin
 * クライアント + クライアント側 fetch 前提）に揃える。
 *
 * 運営専用なので `internal_note` と元判定者の `actor_id` を含めてよい。
 * 元判定者は独立レビュー警告（ADR-005 / REQ-012）の判定に使う。
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    let adminUser;
    try {
      adminUser = await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const adminClient = createAdminClient();
    const appeals = await listPendingAppealsForAdmin(limit, offset, adminClient);

    return NextResponse.json({
      appeals: appeals.map((appeal) => ({
        ...appeal,
        hide_thumbnail: shouldHideThumbnailForPolicy(appeal.policy_code),
        post_image_url: shouldHideThumbnailForPolicy(appeal.policy_code)
          ? null
          : getPostThumbUrl({
              storage_path_thumb: appeal.post_storage_path_thumb,
              image_url: appeal.post_image_url,
              storage_path: null,
            }),
        // 元判定者が自分かどうかだけを返し、他の運営の user id は露出させない
        is_original_decider: appeal.original_actor_id === adminUser.id,
        original_actor_id: undefined,
      })),
    });
  } catch (error) {
    console.error("Appeal queue API error:", error);
    return NextResponse.json(
      { error: "異議申立てキューの取得に失敗しました" },
      { status: 500 }
    );
  }
}

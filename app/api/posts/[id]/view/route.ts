import { NextRequest, NextResponse } from "next/server";
import { incrementViewCount } from "@/features/posts/lib/server-api";
import { getPost } from "@/features/posts/lib/server-api";
import { getUser } from "@/lib/auth";
import { isFullAdmin, isPostImpressionsEnabled } from "@/lib/env";
import { isCrawler } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * 閲覧数をインクリメントするAPI
 * CachedPostDetailでサーバーキャッシュを使用するため、クライアントから呼び出して閲覧数をカウント
 *
 * フラグON時は、詳細到達も viewable インプレッションとして計上する
 * (docs/planning/post-impressions-implementation-plan.md の v1.1 拡張)。
 * フィード計測と同じ record_post_impressions RPC / dedup を共有するため、
 * 「フィードでも詳細でも、同一投稿×同一視聴者×同一日は1回」となり二重カウントしない。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(_request)];
  try {
    const user = await getUser();
    const currentUserId = user?.id ?? null;
    const isFullAdminViewer = isFullAdmin(currentUserId);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    // 投稿が存在し閲覧可能か確認（未投稿・非公開は404）
    // 管理者は getPost 内部の監視権限で閲覧可能
    const post = await getPost(id, currentUserId, true);
    if (!post) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    // 管理者閲覧は監視目的のためカウントしない
    if (isFullAdminViewer) {
      return NextResponse.json({ success: true, counted: false });
    }

    await incrementViewCount(id);

    // 詳細到達のインプレッション計上(view_count の成否・応答には影響させない)。
    // クローラ/IP不明ゲストは記録しない(EARS-04)。viewer_key はサーバ側で解決(偽装不可)。
    if (
      isPostImpressionsEnabled() &&
      !isCrawler(_request.headers.get("user-agent"))
    ) {
      const ipHash = user ? null : getPopupBannerClientIpHash(_request);
      const viewerKey = user ? `u:${user.id}` : ipHash ? `g:${ipHash}` : null;
      if (viewerKey) {
        try {
          const supabase = createAdminClient();
          const { error } = await supabase.rpc("record_post_impressions", {
            p_image_ids: [id],
            p_viewer_key: viewerKey,
          });
          if (error) {
            console.error("[posts view] impression record failed:", error);
          }
        } catch (impressionError) {
          console.error(
            "[posts view] impression record failed:",
            impressionError
          );
        }
      }
    }

    return NextResponse.json({ success: true, counted: true });
  } catch (error) {
    console.error("View count API error:", error);
    return NextResponse.json(
      {
        error: copy.viewCountUpdateFailed,
        errorCode: "POSTS_VIEW_COUNT_UPDATE_FAILED",
      },
      { status: 500 }
    );
  }
}

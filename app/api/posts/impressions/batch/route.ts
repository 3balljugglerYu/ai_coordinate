import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { isFullAdmin, isPostImpressionsEnabled } from "@/lib/env";
import { isCrawler } from "@/lib/utils";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";

/**
 * 投稿インプレッションのバッチ記録API
 * (計画書: docs/planning/post-impressions-implementation-plan.md)
 *
 * フィードで viewable(可視50%×1秒)になったカードの image_id を、クライアントが
 * デバウンス/離脱時 sendBeacon でまとめて送ってくる。ここで viewer_key をサーバ側で
 * 解決し(body からは受け取らない=偽装不可)、RPC `record_post_impressions` に委譲する。
 * dedup(日次×視聴者×投稿)と加算は RPC がバッチ原子実行する。
 *
 * - フラグ OFF / admin / クローラ / IP 不明ゲスト は記録せず 204(no-op)。
 *   クライアントは応答を見ない(EARS-07: 失敗しても UI を妨げない)。
 * - キャッシュ方針: 書き込み後に revalidate しない。フィード/詳細の表示は
 *   use cache (cacheLife("minutes")) の自然失効で追いつく(厳密な即時性より負荷軽減を優先)。
 */

const bodySchema = z.object({
  image_ids: z.array(z.string().uuid()).min(1).max(100),
});

function noop(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    // 段階公開フラグ(ADR-005)。OFF 時は計測自体を行わない。
    if (!isPostImpressionsEnabled()) {
      return noop();
    }

    // クローラ/bot は数えない(EARS-04)。prefetch 対策はクライアント側の
    // 「可視50%×1秒のみ計測」(ADR-003)で担保される(POST は prefetch されない)。
    if (isCrawler(request.headers.get("user-agent"))) {
      return noop();
    }

    // sendBeacon は Content-Type が text/plain になり得るため request.json() ではなく
    // text() → JSON.parse でパースする。
    let parsed: z.infer<typeof bodySchema>;
    try {
      const raw = await request.text();
      const result = bodySchema.safeParse(JSON.parse(raw));
      if (!result.success) {
        return NextResponse.json(
          { error: "invalid body", errorCode: "POSTS_IMPRESSIONS_INVALID_BODY" },
          { status: 400 },
        );
      }
      parsed = result.data;
    } catch {
      return NextResponse.json(
        { error: "invalid body", errorCode: "POSTS_IMPRESSIONS_INVALID_BODY" },
        { status: 400 },
      );
    }

    const user = await getUser();

    // 管理者の閲覧は監視目的のためカウントしない(view route と同方針)。
    if (isFullAdmin(user?.id ?? null)) {
      return noop();
    }

    // viewer_key はサーバ側でのみ解決(ADR-001): 認証 u:<user_id> / ゲスト g:<ip_hash>。
    // IP が取れないゲストは dedup 不能なため安全側(数えない)に倒す。
    let viewerKey: string;
    if (user) {
      viewerKey = `u:${user.id}`;
    } else {
      const ipHash = getPopupBannerClientIpHash(request);
      if (!ipHash) {
        return noop();
      }
      viewerKey = `g:${ipHash}`;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("record_post_impressions", {
      p_image_ids: parsed.image_ids,
      p_viewer_key: viewerKey,
    });

    if (error) {
      console.error("[posts impressions batch] RPC failed:", error);
      return NextResponse.json(
        { error: "failed", errorCode: "POSTS_IMPRESSIONS_RECORD_FAILED" },
        { status: 500 },
      );
    }

    return NextResponse.json({ recorded: data ?? 0 });
  } catch (error) {
    console.error("[posts impressions batch] unexpected error:", error);
    return NextResponse.json(
      { error: "failed", errorCode: "POSTS_IMPRESSIONS_RECORD_FAILED" },
      { status: 500 },
    );
  }
}

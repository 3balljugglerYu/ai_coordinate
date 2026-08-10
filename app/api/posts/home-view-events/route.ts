import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { isFullAdmin } from "@/lib/env";
import { isCrawler } from "@/lib/utils";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";

/**
 * ホームの表示形式(グリッド / フィード)の効果測定イベント記録 API
 * (計画書: docs/planning/home-feed-view-implementation-plan.md ADR-003 / ADR-006)
 *
 * クライアントから直接 INSERT させない。viewer_key はここでサーバー側から解決し
 * (body からは受け取らない = 偽装不可)、post_id は公開中の投稿かを確認してから
 * admin クライアントで書く。KPI テーブルが汚れると既定切り替えの判断を誤る。
 *
 * 送信は best-effort。クライアントは応答を見ないので、記録しない場合も 204 を返す。
 */

const bodySchema = z
  .object({
    event_type: z.enum([
      "home_viewed",
      "view_mode_changed",
      "prompt_use_tapped",
      "follow_from_card",
    ]),
    // 'none' はホーム未経由の流入。ホームで発生するイベントには許さない
    // (DB の CHECK と二重にする)。
    view_mode: z.enum(["grid", "feed", "none"]),
    from_view_mode: z.enum(["grid", "feed"]).optional(),
    post_id: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      value.event_type !== "view_mode_changed" || value.from_view_mode !== undefined,
    { message: "from_view_mode is required for view_mode_changed" }
  )
  .refine(
    (value) =>
      value.view_mode !== "none" ||
      value.event_type === "prompt_use_tapped" ||
      value.event_type === "follow_from_card",
    { message: "view_mode 'none' is only valid for tap events" }
  );

function noop(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    // クローラ/bot は数えない(インプレッション計測と同じ方針)
    if (isCrawler(request.headers.get("user-agent"))) {
      return noop();
    }

    // sendBeacon は Content-Type が text/plain になり得るため text() → JSON.parse でパースする
    let parsed: z.infer<typeof bodySchema>;
    try {
      const result = bodySchema.safeParse(JSON.parse(await request.text()));
      if (!result.success) {
        return NextResponse.json(
          { error: "invalid body", errorCode: "HOME_VIEW_EVENTS_INVALID_BODY" },
          { status: 400 }
        );
      }
      parsed = result.data;
    } catch {
      return NextResponse.json(
        { error: "invalid body", errorCode: "HOME_VIEW_EVENTS_INVALID_BODY" },
        { status: 400 }
      );
    }

    const user = await getUser();

    // 運営の閲覧は監視目的なので KPI に混ぜない(インプレッション計測と同じ方針)
    if (isFullAdmin(user?.id ?? null)) {
      return noop();
    }

    // viewer_key はサーバー側でのみ解決する。IP が取れないゲストは
    // 同一人物の判定ができず「維持したか」の分析に使えないので数えない。
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

    // post_id は公開中の投稿だけ通す。存在しない ID や非公開投稿を混ぜられると
    // 「どの投稿が使われたか」の集計が狂う。
    let postId: string | null = null;
    if (parsed.post_id) {
      const { data, error } = await supabase
        .from("generated_images")
        .select("id")
        .eq("id", parsed.post_id)
        .eq("is_posted", true)
        .eq("moderation_status", "visible")
        .maybeSingle();
      if (error) {
        console.error("[home-view-events] post lookup failed:", error);
        return noop();
      }
      if (!data) {
        return noop();
      }
      postId = parsed.post_id;
    }

    const { error } = await supabase.from("home_view_events").insert({
      user_id: user?.id ?? null,
      viewer_key: viewerKey,
      event_type: parsed.event_type,
      view_mode: parsed.view_mode,
      from_view_mode: parsed.from_view_mode ?? null,
      post_id: postId,
    });

    if (error) {
      console.error("[home-view-events] insert failed:", error);
      return noop();
    }

    return noop();
  } catch (error) {
    console.error("[home-view-events] unexpected error:", error);
    return noop();
  }
}

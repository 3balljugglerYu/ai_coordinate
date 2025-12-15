import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 通知一覧取得API
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const cursor = searchParams.get("cursor");

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 通知一覧を取得するクエリを構築
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1); // 次のページがあるか確認するため+1

    // カーソルがある場合はフィルタを追加
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString();
        const [cursorCreatedAt, cursorId] = decoded.split("|");

        if (cursorCreatedAt && cursorId) {
          // created_at < cursor_created_at OR (created_at = cursor_created_at AND id < cursor_id)
          // Supabaseのor構文を使用
          query = query.or(
            `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
          );
        }
      } catch (error) {
        console.error("Failed to decode cursor:", error);
        // カーソルのデコードに失敗した場合は無視して続行
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Database query error:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "通知の取得に失敗しました",
        },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        notifications: [],
        nextCursor: null,
      });
    }

    // 次のページがあるか確認
    const hasNextPage = data.length > limit;
    const notifications = hasNextPage ? data.slice(0, limit) : data;

    // 次のカーソルを生成
    let nextCursor: string | null = null;
    if (hasNextPage && notifications.length > 0) {
      const lastNotification = notifications[notifications.length - 1];
      const cursorString = `${lastNotification.created_at}|${lastNotification.id}`;
      nextCursor = Buffer.from(cursorString).toString("base64");
    }

    // actor情報を取得（別クエリ）
    const actorIds = Array.from(
      new Set(notifications.map((n) => n.actor_id).filter(Boolean))
    );

    const actorMap: Record<
      string,
      { nickname: string | null; avatar_url: string | null }
    > = {};
    if (actorIds.length > 0) {
      const { data: actors, error: actorsError } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .in("user_id", actorIds);

      if (!actorsError && actors) {
        for (const actor of actors) {
          actorMap[actor.user_id] = {
            nickname: actor.nickname,
            avatar_url: actor.avatar_url,
          };
        }
      }
    }

    // 投稿情報を取得（entity_typeが'post'の場合）
    const postIds = notifications
      .filter((n) => n.entity_type === "post")
      .map((n) => n.entity_id);

    const postMap: Record<
      string,
      { image_url: string | null; caption: string | null }
    > = {};
    if (postIds.length > 0) {
      const { data: posts, error: postsError } = await supabase
        .from("generated_images")
        .select("id, image_url, caption")
        .in("id", postIds);

      if (!postsError && posts) {
        for (const post of posts) {
          postMap[post.id] = {
            image_url: post.image_url,
            caption: post.caption,
          };
        }
      }
    }

    // 通知にactor情報と投稿情報を追加
    const notificationsWithDetails = notifications.map((notification) => {
      const actor = actorMap[notification.actor_id];
      const post =
        notification.entity_type === "post"
          ? postMap[notification.entity_id]
          : null;
      return {
        ...notification,
        actor: actor
          ? {
              id: notification.actor_id,
              nickname: actor.nickname,
              avatar_url: actor.avatar_url,
            }
          : null,
        post: post || null,
      };
    });

    return NextResponse.json({
      notifications: notificationsWithDetails,
      nextCursor,
    });
  } catch (error) {
    console.error("Notifications API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "通知の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}


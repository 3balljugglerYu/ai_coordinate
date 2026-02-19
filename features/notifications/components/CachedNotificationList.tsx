import { cacheLife, cacheTag } from "next/cache";
import { getNotificationsServer } from "../lib/server-api";
import { NotificationList } from "./NotificationList";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedNotificationListProps {
  userId: string;
}

/**
 * お知らせ画面用（use cache でサーバーキャッシュ）
 * 初期表示用の通知一覧をキャッシュ
 */
export async function CachedNotificationList({
  userId,
}: CachedNotificationListProps) {
  "use cache";
  cacheTag(`notifications-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const { notifications, nextCursor } = await getNotificationsServer(
    userId,
    20,
    supabase
  );

  return (
    <NotificationList
      initialNotifications={notifications}
      initialNextCursor={nextCursor}
    />
  );
}
